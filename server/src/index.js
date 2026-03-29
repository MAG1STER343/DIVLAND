const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const { put } = require("@vercel/blob");

const { openDb, nowIso, slugify, ensureUniqueSlug } = require("./db");
const { sha256Hex, randomToken } = require("./security");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const isVercel = process.env.VERCEL === "1";
const ROOT_DIR = path.join(__dirname, "..", "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

// For Vercel, we'll use Memory Storage for small uploads before sending to Blob
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
    await getDb();
    next();
  } catch (e) {
    console.error("DB Initialization failed:", e.message);
    const errorPrefix = process.env.VERCEL === "1" ? "DATABASE ERROR (Vercel): " : "DATABASE ERROR (Local): ";
    res.status(500).json({ 
       ok: false, 
       status: "error", 
       message: "Database initialization failed",
       error: errorPrefix + e.message 
    });
  }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Static: only the site entry files 
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
    const u = await db.get("SELECT username, login, slug, audio_path, video_path, avatar_path, bg_color, case_text FROM users WHERE id = $1 LIMIT 1", [
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
      },
    });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка");
  }
});

// --- Upload Logic (Vercel Blob)
async function uploadToBlob(file, prefix) {
  const filename = `${prefix}/${Date.now()}-${file.originalname}`;
  // For Vercel, file.buffer is used; for local, readFileSync is used
  const buffer = file.buffer || fs.readFileSync(file.path);
  const blob = await put(filename, buffer, {
    access: "public",
    addRandomSuffix: true
  });
  return blob.url;
}

app.post("/api/media/audio", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    if (f.size > 40 * 1024 * 1024) return bad(res, 400, "MP3 должен весить не больше 40MB");
    
    const url = await uploadToBlob(f, "audio");
    await db.run("UPDATE users SET audio_path = $1 WHERE id = $2", [url, req.user.id]);
    return res.json({ ok: true, audioUrl: url });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка загрузки аудио");
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
    console.error(e);
    return bad(res, 500, "Ошибка загрузки видео");
  }
});

app.post("/api/media/avatar", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    
    const url = await uploadToBlob(f, "avatars");
    await db.run("UPDATE users SET avatar_path = $1 WHERE id = $2", [url, req.user.id]);
    return res.json({ ok: true, avatarUrl: url });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка загрузки аватара");
  }
});

// --- Public APIs
app.get("/api/profile/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const u = await db.get("SELECT username, login, slug, created_at, audio_path, video_path, avatar_path, bg_color, case_text FROM users WHERE slug = $1 LIMIT 1", [
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
    return bad(res, 500, "Ошибка");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
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
