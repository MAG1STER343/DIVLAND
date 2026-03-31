const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { put, del } = require("@vercel/blob");

const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");

const { openDb, nowIso, slugify, ensureUniqueSlug } = require("./db");
const { sha256Hex, randomToken } = require("./security");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const isVercel = process.env.VERCEL === "1";

function getBlobToken() {
  // 1. Try standard and previously known custom names
  let token = process.env.BLOB_READ_WRITE_TOKEN || process.env.OISDFGJ989_READ_WRITE_TOKEN;
  if (token) return token;

  // 2. Dynamic discovery: search for any key containing 'READ_WRITE_TOKEN'
  const foundKey = Object.keys(process.env).find(k => k.includes("READ_WRITE_TOKEN") || k.includes("BLOB_RW"));
  if (foundKey) return process.env[foundKey];

  return null;
}

if (isVercel && !getBlobToken()) {
  console.warn("WARNING: No Vercel Blob token found in environment variables.");
}

const ROOT_DIR = path.join(__dirname, "..", "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

// For Vercel, we'll use Memory Storage for small uploads
const storage = isVercel ? multer.memoryStorage() : multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "data", "tmp");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `tmp-${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 55 * 1024 * 1024 } 
});

const app = express();
let db = null;
let dbInitialization = null;

async function getDb() {
  if (db) return db;
  if (!dbInitialization) {
    dbInitialization = openDb().then(instance => {
      db = instance;
      return db;
    });
  }
  return dbInitialization;
}

// Middleware to ensure DB is initialized
app.use(async (req, res, next) => {
  try {
    const database = await getDb();
    if (!database) throw new Error("Database instance is null after init.");
    next();
  } catch (e) {
    console.error("CRITICAL DB ERROR:", e);
    const mode = process.env.VERCEL === "1" ? "VERCEL" : "LOCAL";
    res.status(500).json({ 
       ok: false, 
       status: "error", 
       message: "Database initialization failed",
       details: `[${mode}] ${e.message}` 
    });
  }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Standardized favicon handle to stop 404/500 noise
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/", (req, res) => res.sendFile(path.join(ROOT_DIR, "index.html")));
app.get("/styles.css", (req, res) => res.sendFile(path.join(ROOT_DIR, "styles.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(ROOT_DIR, "script.js")));

app.use("/assets", express.static(ASSETS_DIR));

const COOKIE_NAME = process.env.SESSION_COOKIE || "dieversi_session";
const SESSION_TTL_DAYS = 14;

function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

// --- Dynamic Promo Codes (Rotating every 5 minutes)
function getPromo() {
  const windowIdx = Math.floor(Date.now() / 300000); // 5 min
  const seed = (windowIdx * 12345).toString();
  const hash = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
  const part1 = hash.substring(0, 4);
  const part2 = hash.substring(4, 8);
  return { code: `L-${part1} ${part2}`, expiresAt: (windowIdx + 1) * 300000 };
}

function validateString(v, { min = 1, max = 120 } = {}) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie || "";
  const token = parseCookie(cookie, COOKIE_NAME);
  if (!token) return bad(res, 401, "Не авторизован");

  const tokenHash = sha256Hex(token);
  const row = await db.get(
    "SELECT s.user_id as user_id, s.expires_at as expires_at, u.slug as slug, u.username as username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 LIMIT 1",
    [tokenHash]
  );
  if (!row) return bad(res, 401, "Сессия не найдена");

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    return bad(res, 401, "Сессия истекла");
  }

  req.user = { id: row.user_id, slug: row.slug, username: row.username };
  req.sessionToken = token;
  next();
}

function parseCookie(cookieHeader, name) {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p.startsWith(name + "=")) continue;
    return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === "true" || isVercel;
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 5) return false;
  const [algoName, algo, iterStr, salt, hash] = parts;
  if (algoName !== "pbkdf2" || algo !== "sha256") return false;
  const iters = Number(iterStr);
  if (!iters || iters < 20000) return false;
  const h = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
}

// --- Auth: register
app.post("/api/auth/register", async (req, res) => {
  try {
    const username = validateString(req.body?.username, { min: 2, max: 40 });
    const login = validateString(req.body?.login, { min: 2, max: 40 });
    const password = validateString(req.body?.password, { min: 2, max: 120 });
    if (!username || !login || !password) return bad(res, 400, "Некорректные данные (min 2 символа)");

    const loginNorm = login.toLowerCase();
    const emailNorm = `${loginNorm}@local.invalid`;

    const exists = await db.get("SELECT id FROM users WHERE login = $1 LIMIT 1", [loginNorm]);
    if (exists) return bad(res, 409, "Пользователь с таким логином уже существует");

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
    const passwordHash = `pbkdf2$sha256$120000$${salt}$${hash}`;

    const baseSlug = slugify(username) || slugify(loginNorm) || "user";
    const slug = await ensureUniqueSlug(db, baseSlug);

    const createdAt = nowIso();
    const ins = await db.run(
      "INSERT INTO users(username, login, email, password_hash, slug, created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [username, loginNorm, emailNorm, passwordHash, slug, createdAt]
    );
    const userId = Number(ins.lastInsertRowid);

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.run("INSERT INTO sessions(user_id, token_hash, expires_at, created_at) VALUES($1,$2,$3,$4)", [
      userId,
      tokenHash,
      expiresAt,
      createdAt,
    ]);
    setSessionCookie(res, token);

    return res.json({ ok: true, userId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Ошибка регистрации", details: e.message });
  }
});

// --- Auth: login
app.post("/api/auth/login", async (req, res) => {
  try {
    const login = validateString(req.body?.login, { min: 2, max: 80 });
    const password = validateString(req.body?.password, { min: 2, max: 120 });
    if (!login || !password) return bad(res, 400, "Некорректные данные");

    const user = await db.get("SELECT id, password_hash FROM users WHERE login = $1 LIMIT 1", [
      login.toLowerCase(),
    ]);
    if (!user) return bad(res, 400, "Неверный логин или пароль");

    if (!verifyPassword(password, user.password_hash)) return bad(res, 400, "Неверный логин или пароль");

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.run("INSERT INTO sessions(user_id, token_hash, expires_at, created_at) VALUES($1,$2,$3,$4)", [
      user.id,
      tokenHash,
      expiresAt,
      createdAt,
    ]);
    setSessionCookie(res, token);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка входа");
  }
});

// --- Auth: logout
app.post("/api/auth/logout", requireAuth, async (req, res) => {
  try {
    const tokenHash = sha256Hex(req.sessionToken);
    await db.run("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка выхода");
  }
});

// --- Auth: current user
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const u = await db.get("SELECT username, login, slug, audio_path, video_path, avatar_path, bg_color, case_text, balance_l, steam_url, faceit_url, discord_user, instagram_url, telegram_user, twitch_url, active_background, owned_backgrounds FROM users WHERE id = $1 LIMIT 1", [
      req.user.id,
    ]);
    if (!u) return bad(res, 404, "Пользователь не найден");
    return res.json({
      ok: true,
      user: {
        username: u.username,
        login: u.login,
        slug: u.slug,
        audioUrl: u.audio_path || null,
        videoUrl: u.video_path || null,
        avatarUrl: u.avatar_path || null,
        bgColor: u.bg_color || "default",
        caseText: u.case_text || null,
        balance_l: u.balance_l || 0,
        steamUrl: u.steam_url || null,
        faceitUrl: u.faceit_url || null,
        discordUser: u.discord_user || null,
        instagramUrl: u.instagram_url || null,
        telegramUser: u.telegram_user || null,
        twitchUrl: u.twitch_url || null,
        activeBackground: u.active_background || "HOLO",
        ownedBackgrounds: JSON.parse(u.owned_backgrounds || '["HOLO"]'),
      },
    });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка");
  }
});

async function uploadToDb(file, type, userId) {
  try {
    const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
    if (!buffer) throw new Error("File content is missing or empty.");
    
    // Ensure the byte length is reasonable for DB storage
    if (buffer.length > 2 * 1024 * 1024) throw new Error("File exceeds 2MB limit for bytea storage.");

    // Save to DB (as bytea)
    if (type === 'avatar') {
      const sql = "UPDATE users SET avatar_blob = $1, avatar_path = $2 WHERE id = $3";
      await db.run(sql, [buffer, `/api/media/render/avatar/${userId}`, userId]);
    } else if (type === 'audio') {
      const sql = "UPDATE users SET audio_blob = $1, audio_path = $2 WHERE id = $3";
      await db.run(sql, [buffer, `/api/media/render/audio/${userId}`, userId]);
    }
    return true;
  } catch (err) {
    console.error(`DB Upload (${type}) error:`, err);
    throw err;
  }
}

async function uploadToBlob(file, prefix) {
  try {
    const filename = `${prefix}/${Date.now()}-${file.originalname || "upload"}`;
    const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
    if (!buffer) throw new Error("File content is missing.");

    const token = getBlobToken();
    if (!token) throw new Error("Vercel Blob token is missing! Please connect your Blob store in the dashboard.");

    const blob = await put(filename, buffer, {
      access: "public", 
      addRandomSuffix: true,
      token: token
    });
    return blob.url;
  } catch (err) {
    if (err.message.includes("public access on a private store")) {
       throw new Error("CRITICAL: Vercel Blob is set to PRIVATE. Change it to PUBLIC in Vercel settings.");
    }
    throw err;
  }
}

app.post("/api/media/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    await uploadToDb(req.file, 'avatar', req.user.id);
    res.json({ ok: true, avatar_url: `/api/media/render/avatar/${req.user.id}?t=${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/media/audio", requireAuth, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });
    await uploadToDb(req.file, 'audio', req.user.id);
    res.json({ ok: true, audio_url: `/api/media/render/audio/${req.user.id}?t=${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// New route to serve media from DB
app.get("/api/media/render/:type/:userId", async (req, res) => {
  try {
    const { type, userId } = req.params;
    const colName = type === 'avatar' ? 'avatar_blob' : 'audio_blob';
    const user = await db.get(`SELECT ${colName} FROM users WHERE id = $1`, [userId]);
    
    if (!user || !user[colName]) return res.status(404).send("Not found");
    
    const contentType = type === 'avatar' ? 'image/webp' : 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(user[colName]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/api/media/video", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    
    // FFMPEG is not easily available on Vercel without large binaries, 
    // we'll upload the video directly to Blob.
    const url = await uploadToBlob(f, "video");
    await db.run("UPDATE users SET video_path = $1 WHERE id = $2", [url, req.user.id]);
    return res.json({ ok: true, videoUrl: url });
  } catch (e) {
    console.error("Video Upload Error:", e);
    return bad(res, 500, `Ошибка загрузки видео: ${e.message}`);
  }
});

// --- Delete Logic
app.delete("/api/media/avatar", requireAuth, async (req, res) => {
  try {
    await db.run("UPDATE users SET avatar_blob = NULL, avatar_path = NULL WHERE id = $1", [req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Avatar Delete Error:", e);
    return bad(res, 500, `Ошибка удаления аватара: ${e.message}`);
  }
});

app.delete("/api/media/audio", requireAuth, async (req, res) => {
  try {
    await db.run("UPDATE users SET audio_blob = NULL, audio_path = NULL WHERE id = $1", [req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка удаления аудио");
  }
});

app.delete("/api/media/video", requireAuth, async (req, res) => {
  try {
    const u = await db.get("SELECT video_path FROM users WHERE id = $1", [req.user.id]);
    if (u && u.video_path && u.video_path.includes("blob.vercel-storage.com")) {
      try { await del(u.video_path); } catch(e) { console.error("Blob delete failed:", e); }
    }
    await db.run("UPDATE users SET video_path = NULL WHERE id = $1", [req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка удаления видео");
  }
});

// --- Public APIs
app.get("/api/profile/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const u = await db.get("SELECT username, login, slug, created_at, audio_path, video_path, avatar_path, bg_color, case_text, steam_url, faceit_url, discord_user, instagram_url, telegram_user, twitch_url, active_background FROM users WHERE slug = $1 LIMIT 1", [
    slug,
  ]);
  if (!u) return bad(res, 404, "Профиль не найден");
  return res.json({
    ok: true,
    profile: {
      username: u.username,
      login: u.login,
      slug: u.slug,
      createdAt: u.created_at,
      audioUrl: u.audio_path || null,
      videoUrl: u.video_path || null,
      avatarUrl: u.avatar_path || null,
      bgColor: u.bg_color || "default",
      caseText: u.case_text || null,
      steamUrl: u.steam_url || null,
      faceitUrl: u.faceit_url || null,
      discordUser: u.discord_user || null,
      instagramUrl: u.instagram_url || null,
      telegramUser: u.telegram_user || null,
      twitchUrl: u.twitch_url || null,
      activeBackground: u.active_background || "HOLO",
    },
  });
});

app.post("/api/profile/update", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = [];
    const params = [];
    
    if (body.bgColor !== undefined) {
      updates.push(`bg_color = $${updates.length + 1}`);
      params.push(String(body.bgColor).trim());
    }
    if (body.caseText !== undefined) {
      updates.push(`case_text = $${updates.length + 1}`);
      params.push(String(body.caseText).trim());
    }
    
    // Integration fields
    const intFields = ["steam_url", "faceit_url", "discord_user", "instagram_url", "telegram_user", "twitch_url"];
    const bodyMap = {
       "steam_url": "steamUrl",
       "faceit_url": "faceitUrl",
       "discord_user": "discordUser",
       "instagram_url": "instagramUrl",
       "telegram_user": "telegramUser",
       "twitch_url": "twitchUrl"
    };

    intFields.forEach(f => {
      const bKey = bodyMap[f];
      if (body[bKey] !== undefined) {
        updates.push(`${f} = $${updates.length + 1}`);
        params.push(body[bKey] === null ? null : String(body[bKey]).trim());
      }
    });
    
    if (updates.length > 0) {
      params.push(req.user.id);
      await db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
    }
    
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка обновления профиля");
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await db.all("SELECT username, login, slug, created_at, avatar_path FROM users ORDER BY id DESC");
    return res.json({ ok: true, users });
  } catch (e) {
    console.error("API /api/users ERROR:", e);
    return bad(res, 500, `Ошибка: ${e.message}`);
  }
});

// --- Currency: redeem
app.post("/api/currency/redeem", requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return bad(res, 400, "Введите код");

    const inputCode = code.trim().toUpperCase();

    // 1. Check Global Promo (5 min)
    const currentPromo = getPromo();
    if (inputCode === currentPromo.code) {
       const user = await db.get("SELECT last_promo_at FROM users WHERE id = $1", [req.user.id]);
       const windowStart = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
       
       if (user.last_promo_at && new Date(user.last_promo_at) >= new Date(windowStart)) {
         return bad(res, 400, "Вы уже получили этот подарок!");
       }
       
       await db.run("UPDATE users SET balance_l = balance_l + 500, last_promo_at = $1 WHERE id = $2", [
         nowIso(), req.user.id
       ]);
       return res.json({ ok: true, message: "Золотой код активирован! +500 L", added: 500 });
    }

    // 2. Check Admin Code
    const adminCode = process.env.ADMIN_REDEEM_CODE || "L-FDAK298D32";
    if (inputCode === adminCode.toUpperCase()) {
      await db.run("UPDATE users SET balance_l = balance_l + 20000 WHERE id = $1", [req.user.id]);
      return res.json({ ok: true, message: "Админ-код активирован! +20,000 L", added: 20000 });
    }

    return bad(res, 400, "Неверный код");
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка активации");
  }
});

// --- Promo: current
app.get("/api/promo/current", (req, res) => {
  const p = getPromo();
  res.json({ ok: true, code: p.code, endsInMs: p.expiresAt - Date.now() });
});

// --- Shop: buy
app.post("/api/shop/buy", requireAuth, async (req, res) => {
  try {
    const { itemId } = req.body || {};
    if (!itemId) return bad(res, 400, "Предмет не указан");

    const user = await db.get("SELECT balance_l, owned_backgrounds FROM users WHERE id = $1", [req.user.id]);
    const owned = JSON.parse(user.owned_backgrounds || '["HOLO"]');

    if (itemId === "BLACK_HOLE") {
      const price = 1500;
      if (owned.includes("BLACK_HOLE")) return bad(res, 400, "У вас уже есть этот фон");
      if (user.balance_l < price) return bad(res, 400, "Недостаточно L валюты");

      owned.push("BLACK_HOLE");
      await db.run("UPDATE users SET balance_l = balance_l - $1, owned_backgrounds = $2 WHERE id = $3", [
        price, JSON.stringify(owned), req.user.id
      ]);
      return res.json({ ok: true, message: "Фон Black Hole куплен!" });
    }

    return bad(res, 400, "Предмет не найден в магазине");
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка покупки");
  }
});

// --- Background: set
app.post("/api/background/set", requireAuth, async (req, res) => {
  try {
    const { backgroundId } = req.body || {};
    if (!backgroundId) return bad(res, 400, "Фон не выбран");

    const user = await db.get("SELECT owned_backgrounds FROM users WHERE id = $1", [req.user.id]);
    const owned = JSON.parse(user.owned_backgrounds || '["HOLO"]');

    if (!owned.includes(backgroundId)) return bad(res, 403, "У вас нет этого фона");

    await db.run("UPDATE users SET active_background = $1 WHERE id = $2", [backgroundId, req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка смены фона");
  }
});

// --- Admin: Cleanup (TEMPORARY)
app.post("/api/admin/system-cleanup", async (req, res) => {
  try {
    const { code, usernames } = req.body || {};
    const adminCode = process.env.ADMIN_REDEEM_CODE || "L-FDAK298D32";
    if (!code || code.toUpperCase() !== adminCode.toUpperCase()) {
      return bad(res, 403, "Доступ запрещен");
    }
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return bad(res, 400, "Список пользователей пуст");
    }

    // Use a placeholder-based DELETE for safety
    const placeholders = usernames.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `DELETE FROM users WHERE username IN (${placeholders})`;
    await db.run(sql, usernames);

    return res.json({ ok: true, message: `Удалено пользователей: ${usernames.length}` });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка очистки");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

// Global error handler to catch EVERYTHING and report as JSON
app.use((err, req, res, next) => {
  console.error("Express Global Error:", err);
  const mode = process.env.VERCEL === "1" ? "VERCEL" : "LOCAL";
  res.status(500).json({ 
     ok: false, 
     error: `Internal Server Error [${mode}]`, 
     details: err.message,
     stack: process.env.VERCEL === "1" ? undefined : err.stack 
  });
});

async function start() {
  try {
    await getDb();
    if (require.main === module) {
       app.listen(3000, () => console.log(`[server] listening on 3000`));
    }
  } catch (e) {
    console.error("FAILED TO START SERVER:", e);
  }
}

start();

module.exports = app;
