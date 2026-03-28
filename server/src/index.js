const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");

const { openDb, nowIso, slugify, ensureUniqueSlug } = require("./db");
const { sha256Hex, randomToken } = require("./security");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const isVercel = process.env.VERCEL === "1";
const ROOT_DIR = path.join(__dirname, "..", "..");
const SOUNDS_DIR = isVercel ? path.join("/tmp", "sounds") : path.join(ROOT_DIR, "sounds");
const VIDEOS_DIR = isVercel ? path.join("/tmp", "videos") : path.join(ROOT_DIR, "videos");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const AVATARS_DIR = isVercel ? path.join("/tmp", "avatars") : path.join(ROOT_DIR, "avatars");
const TEMP_DIR = isVercel ? path.join("/tmp", "data", "tmp") : path.join(__dirname, "..", "data", "tmp");

fs.mkdirSync(SOUNDS_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// Vercel: copy original assets to /tmp so they can be served
if (isVercel) {
  const origSound = path.join(ROOT_DIR, "sounds", "diversipapa.mp3");
  const destSound = path.join(SOUNDS_DIR, "diversipapa.mp3");
  if (fs.existsSync(origSound) && !fs.existsSync(destSound)) {
    fs.copyFileSync(origSound, destSound);
  }
}

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
    console.error("DB Initialization failed:", e);
    res.status(500).json({ status: "error", message: "Database initialization failed" });
  }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Static: only the site entry files (avoid exposing /server/*)
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/", (req, res) => res.sendFile(path.join(ROOT_DIR, "index.html")));
app.get("/styles.css", (req, res) => res.sendFile(path.join(ROOT_DIR, "styles.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(ROOT_DIR, "script.js")));

// Routes that should NOT be handled by SPA wildcard should come first
app.use("/assets", express.static(ASSETS_DIR));
app.use("/sounds", express.static(SOUNDS_DIR));
app.use("/videos", express.static(VIDEOS_DIR));
app.use("/avatars", express.static(AVATARS_DIR));

const SITE_NAME = process.env.SITE_NAME || "DIIEVERSI";
const COOKIE_NAME = process.env.SESSION_COOKIE || "dieversi_session";
const SESSION_TTL_DAYS = 14;

// global db is initialized via getDb() middleware

function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function validateString(v, { min = 1, max = 120 } = {}) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

function requireAuth(req, res, next) {
  const cookie = req.headers.cookie || "";
  const token = parseCookie(cookie, COOKIE_NAME);
  if (!token) return bad(res, 401, "Не авторизован");

  const tokenHash = sha256Hex(token);
  const row = db.get(
    "SELECT s.user_id as user_id, s.expires_at as expires_at, u.slug as slug, u.username as username, u.login as login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1",
    [tokenHash]
  );
  if (!row) return bad(res, 401, "Сессия не найдена");

  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    return bad(res, 401, "Сессия истекла");
  }

  req.user = { id: row.user_id, slug: row.slug, username: row.username, login: row.login };
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
  const secure = process.env.COOKIE_SECURE === "true";
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

    const exists = db.get("SELECT id FROM users WHERE login = ? LIMIT 1", [loginNorm]);
    if (exists) return bad(res, 409, "Пользователь с таким логином уже существует");

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
    const passwordHash = `pbkdf2$sha256$120000$${salt}$${hash}`;

    const baseSlug = slugify(username) || slugify(loginNorm) || "user";
    const slug = ensureUniqueSlug(db, baseSlug);

    const createdAt = nowIso();
    const ins = db.run(
      "INSERT INTO users(username, login, email, password_hash, slug, created_at) VALUES(?,?,?,?,?,?)",
      [username, loginNorm, emailNorm, passwordHash, slug, createdAt]
    );
    const userId = Number(ins.lastInsertRowid);

    // Create session directly
    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.run("INSERT INTO sessions(user_id, token_hash, expires_at, created_at) VALUES(?,?,?,?)", [
      userId,
      tokenHash,
      expiresAt,
      createdAt,
    ]);
    setSessionCookie(res, token);

    return res.json({ ok: true, userId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Ошибка регистрации", details: e.message, stack: e.stack });
  }
});

// --- Auth: login
app.post("/api/auth/login", (req, res) => {
  try {
    const login = validateString(req.body?.login, { min: 2, max: 80 });
    const password = validateString(req.body?.password, { min: 2, max: 120 });
    if (!login || !password) return bad(res, 400, "Некорректные данные");

    const user = db.get("SELECT id, password_hash FROM users WHERE login = ? LIMIT 1", [
      login.toLowerCase(),
    ]);
    if (!user) return bad(res, 400, "Неверный логин или пароль");

    if (!verifyPassword(password, user.password_hash)) return bad(res, 400, "Неверный логин или пароль");

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.run("INSERT INTO sessions(user_id, token_hash, expires_at, created_at) VALUES(?,?,?,?)", [
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
app.post("/api/auth/logout", requireAuth, (req, res) => {
  try {
    const tokenHash = sha256Hex(req.sessionToken);
    db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
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
app.get("/api/me", requireAuth, (req, res) => {
  try {
    const u = db.get("SELECT username, login, slug, audio_path, video_path, avatar_path, bg_color, case_text FROM users WHERE id = ? LIMIT 1", [
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

// --- Uploads
const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 55 * 1024 * 1024 },
});

app.post("/api/media/audio", requireAuth, upload.single("file"), (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    if (f.size > 40 * 1024 * 1024) {
      safeUnlink(f.path);
      return bad(res, 400, "MP3 должен весить не больше 40MB");
    }
    const ext = path.extname(f.originalname).toLowerCase();
    if (ext !== ".mp3") {
      safeUnlink(f.path);
      return bad(res, 400, "Разрешён только .mp3");
    }

    const name = `u${req.user.id}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.mp3`;
    const dest = path.join(SOUNDS_DIR, name);
    fs.renameSync(f.path, dest);

    const rel = `/sounds/${name}`;
    db.run("UPDATE users SET audio_path = ? WHERE id = ?", [rel, req.user.id]);
    return res.json({ ok: true, audioUrl: rel });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка загрузки аудио");
  }
});

app.post("/api/media/video", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    const ext = path.extname(f.originalname).toLowerCase();
    if (ext !== ".mp4") {
      safeUnlink(f.path);
      return bad(res, 400, "Разрешён только .mp4");
    }

    const base = `u${req.user.id}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const rawPath = path.join(VIDEOS_DIR, `${base}.raw.mp4`);
    const outPath = path.join(VIDEOS_DIR, `${base}.mp4`);
    fs.renameSync(f.path, rawPath);

    await stripAudioWithFfmpeg(rawPath, outPath);
    safeUnlink(rawPath);

    const rel = `/videos/${path.basename(outPath)}`;
    db.run("UPDATE users SET video_path = ? WHERE id = ?", [rel, req.user.id]);
    return res.json({ ok: true, videoUrl: rel });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка загрузки видео");
  }
});

function safeUnlink(p) {
  try { fs.unlinkSync(p); } catch (_) {}
}

function stripAudioWithFfmpeg(inputPath, outPath) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const args = ["-y", "-i", inputPath, "-c:v", "copy", "-an", outPath];
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args);
    p.on("error", (e) => reject(new Error("ffmpeg not found")));
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg failed")));
  });
}

// --- Public APIs
app.get("/api/profile/:slug", (req, res) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const u = db.get("SELECT username, login, slug, created_at, audio_path, video_path, avatar_path, bg_color, case_text FROM users WHERE slug = ? LIMIT 1", [
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

app.post("/api/profile/update", requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    const updates = [];
    const params = [];
    
    if (body.bgColor !== undefined) {
      updates.push("bg_color = ?");
      params.push(String(body.bgColor).trim());
    }
    if (body.caseText !== undefined) {
      updates.push("case_text = ?");
      params.push(String(body.caseText).trim());
    }
    
    if (updates.length > 0) {
      params.push(req.user.id);
      db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
    }
    
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка обновления профиля");
  }
});

app.post("/api/media/avatar", requireAuth, upload.single("file"), (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    const name = `a${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const dest = path.join(AVATARS_DIR, name);
    fs.renameSync(f.path, dest);
    
    const rel = `/avatars/${name}`;
    db.run("UPDATE users SET avatar_path = ? WHERE id = ?", [rel, req.user.id]);
    return res.json({ ok: true, avatarUrl: rel });
  } catch (e) {
    console.error(e);
    return bad(res, 500, "Ошибка загрузки аватара");
  }
});

app.get("/api/users", (req, res) => {
  try {
    const users = db.all("SELECT username, login, slug, created_at, avatar_path FROM users ORDER BY id DESC");
    return res.json({ ok: true, users });
  } catch (e) {
    return bad(res, 500, "Ошибка");
  }
});

// --- SPA Wildcard
app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

function listenWithFallback(port, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[server] listening on http://localhost:${port}`);
      resolve();
    });
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE" && attemptsLeft > 0) {
        return resolve(listenWithFallback(port + 1, attemptsLeft - 1));
      }
      reject(e);
    });
  });
}

async function start() {
  try {
    await getDb();
    if (require.main === module) {
       await listenWithFallback(3000, 15);
    }
  } catch (e) {
    console.error("FAILED TO START SERVER:", e);
  }
}

start();

module.exports = app;
