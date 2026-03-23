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

const ROOT_DIR = path.join(__dirname, "..", "..");
const SOUNDS_DIR = path.join(ROOT_DIR, "sounds");
const VIDEOS_DIR = path.join(ROOT_DIR, "videos");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const TEMP_DIR = path.join(__dirname, "..", "data", "tmp");

fs.mkdirSync(SOUNDS_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Static: only the site entry files (avoid exposing /server/*)
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/", (req, res) => res.sendFile(path.join(ROOT_DIR, "index.html")));
app.get("/styles.css", (req, res) => res.sendFile(path.join(ROOT_DIR, "styles.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(ROOT_DIR, "script.js")));
app.use("/assets", express.static(ASSETS_DIR));

// Uploaded media
app.use("/sounds", express.static(SOUNDS_DIR));
app.use("/videos", express.static(VIDEOS_DIR));

// Public: show first files in sounds/videos as DIEVERSI's
app.get("/api/library/first", (req, res) => {
  try {
    const sound = pickFirstFile(SOUNDS_DIR, [".mp3"]);
    const video = pickFirstFile(VIDEOS_DIR, [".mp4"]);
    return res.json({
      ok: true,
      sound: sound ? { name: sound, url: `/sounds/${sound}` } : null,
      video: video ? { name: video, url: `/videos/${video}` } : null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка");
  }
});

function pickFirstFile(dir, exts) {
  if (!fs.existsSync(dir)) return null;
  const list = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => exts.indexOf(path.extname(name).toLowerCase()) >= 0)
    .sort((a, b) => a.localeCompare(b));
  return list.length ? list[0] : null;
}

const SITE_NAME = process.env.SITE_NAME || "UNNVERSI";
const COOKIE_NAME = process.env.SESSION_COOKIE || "unnversi_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);

let db;

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

// --- Auth: register
app.post("/api/auth/register", async (req, res) => {
  try {
    const username = validateString(req.body?.username, { min: 2, max: 40 });
    const login = validateString(req.body?.login, { min: 2, max: 40 });
    const password = validateString(req.body?.password, { min: 6, max: 120 });
    if (!username || !login || !password) return bad(res, 400, "Некорректные данные");

    const loginNorm = login.toLowerCase();
    const emailNorm = `${loginNorm}@local.invalid`;

    const exists = db.get("SELECT id FROM users WHERE login = ? LIMIT 1", [loginNorm]);
    if (exists) return bad(res, 409, "Пользователь с таким логином уже существует");

    // password hash (pbkdf2 for no extra deps)
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
    const passwordHash = `pbkdf2$sha256$120000$${salt}$${hash}`;

    const baseSlug = slugify(username) || slugify(loginNorm) || "user";
    const slug = ensureUniqueSlug(db, baseSlug);

    const createdAt = nowIso();
    const ins = db.run(
      "INSERT INTO users(username, login, email, password_hash, slug, verified_at, created_at) VALUES(?,?,?,?,?,?,?)",
      [username, loginNorm, emailNorm, passwordHash, slug, nowIso(), createdAt]
    );
    const userId = Number(ins.lastInsertRowid);
    return res.json({ ok: true, userId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка регистрации");
  }
});

// --- Auth: login
app.post("/api/auth/login", (req, res) => {
  try {
    const login = validateString(req.body?.login, { min: 2, max: 80 });
    const password = validateString(req.body?.password, { min: 6, max: 120 });
    if (!login || !password) return bad(res, 400, "Некорректные данные");

    const user = db.get("SELECT id, password_hash, verified_at FROM users WHERE login = ? LIMIT 1", [
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
    // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка выхода");
  }
});

// --- Auth: current user
app.get("/api/me", requireAuth, (req, res) => {
  try {
    const u = db.get("SELECT username, login, slug, audio_path, video_path FROM users WHERE id = ? LIMIT 1", [
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
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка");
  }
});

function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 6) return false;
  const [, algo, iterStr, , salt, hash] = parts;
  if (algo !== "sha256") return false;
  const iters = Number(iterStr);
  if (!iters || iters < 20000) return false;
  const h = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
}

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
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка загрузки аудио");
  }
});

app.post("/api/media/video", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return bad(res, 400, "Файл не получен");
    if (f.size > 50 * 1024 * 1024) {
      safeUnlink(f.path);
      return bad(res, 400, "MP4 должен весить не больше 50MB");
    }
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
    // eslint-disable-next-line no-console
    console.error(e);
    return bad(res, 500, "Ошибка загрузки видео");
  }
});

function safeUnlink(p) {
  try {
    fs.unlinkSync(p);
  } catch (_) {
    // ignore
  }
}

function stripAudioWithFfmpeg(inputPath, outPath) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const argsFast = ["-y", "-i", inputPath, "-c:v", "copy", "-an", outPath];

  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, argsFast, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.on("error", (e) => {
      reject(new Error(`ffmpeg не найден. Установи ffmpeg и добавь в PATH, либо укажи FFMPEG_PATH.\n${e.message}`));
    });
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) return resolve();
      // fallback: re-encode video if stream copy fails
      const argsSlow = ["-y", "-i", inputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-an", outPath];
      const p2 = spawn(ffmpeg, argsSlow, { stdio: ["ignore", "pipe", "pipe"] });
      let err2 = "";
      p2.on("error", (e) => {
        reject(new Error(`ffmpeg ошибка: ${e.message}`));
      });
      p2.stderr.on("data", (d) => {
        err2 += d.toString();
      });
      p2.on("close", (code2) => {
        if (code2 === 0) return resolve();
        return reject(new Error(`ffmpeg failed: ${err}\n---fallback---\n${err2}`));
      });
    });
  });
}

// --- Public profile
app.get("/api/profile/:slug", (req, res) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const u = db.get("SELECT username, login, slug, created_at, audio_path, video_path FROM users WHERE slug = ? LIMIT 1", [
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
    },
  });
});

// SPA fallback for profile links
app.get(["/u/:slug", "/profile/:slug"], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

const preferredPort = Number(process.env.PORT || 3000);
async function main() {
  db = await openDb();
  await listenWithFallback(preferredPort, 12);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

function listenWithFallback(port, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] ${SITE_NAME} listening on http://localhost:${port}`);
      resolve();
    });
    server.on("error", (e) => {
      if (e && e.code === "EADDRINUSE" && attemptsLeft > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[server] port ${port} busy, trying ${port + 1}…`);
        try {
          server.close();
        } catch (_) {
          // ignore
        }
        return resolve(listenWithFallback(port + 1, attemptsLeft - 1));
      }
      // eslint-disable-next-line no-console
      console.error("[server] listen error:", e?.message || e);
      return reject(e);
    });
  });
}

