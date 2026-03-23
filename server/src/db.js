const path = require("node:path");
const fs = require("node:fs");

async function openDb() {
  const dbPath = path.join(__dirname, "..", "data", "db.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // sql.js is a WASM SQLite build (no native компиляции на Windows)
  // eslint-disable-next-line global-require
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  migrate(db);

  let saveTimer = 0;
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    }, 120);
  }

  function run(sql, params = []) {
    db.run(sql, params);
    // last_insert_rowid() is per-connection
    const r = get("SELECT last_insert_rowid() AS id");
    persistSoon();
    return { lastInsertRowid: r?.id ?? null };
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function exec(sql) {
    db.exec(sql);
    persistSoon();
  }

  return { run, get, all, exec };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      login TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      verified_at TEXT NULL,
      created_at TEXT NOT NULL,
      audio_path TEXT NULL,
      video_path TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function ensureUniqueSlug(db, base) {
  let slug = base || "user";
  let i = 0;
  while (db.get("SELECT 1 as one FROM users WHERE slug = ? LIMIT 1", [slug])) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

module.exports = { openDb, nowIso, slugify, ensureUniqueSlug };

