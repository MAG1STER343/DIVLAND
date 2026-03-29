const { Pool } = require("pg");
const path = require("node:path");

/**
 * Open connection to Vercel Postgres.
 * Expects POSTGRES_URL or DATABASE_URL in environment.
 */
async function openDb() {
  // Use any available Postgres connection string
  const connectionString = 
    process.env.POSTGRES_URL || 
    process.env.DATABASE_URL || 
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  
  if (!connectionString) {
    if (process.env.VERCEL === "1") {
       const envKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes("url") || k.toLowerCase().includes("postgres"));
       console.error("DEBUG: Available ENV keys (filtered):", envKeys);
       throw new Error(`DATABASE ERROR: POSTGRES_URL is missing. Available relevant keys: ${envKeys.join(", ")}`);
    }
    console.warn("WARNING: DATABASE_URL not found. Local dev?");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000, // Reduced timeout for faster fail/retry
  });

  // Resilience: Attempt to connect up to 3 times
  let retries = 3;
  while (retries > 0) {
    try {
      await pool.query("SELECT NOW()");
      console.log("Database connected successfully.");
      break;
    } catch (err) {
      retries -= 1;
      console.error(`DB connection failed. Retries left: ${retries}. Error: ${err.message}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Wrapper functions for compatibility with existing code (but now async)
  async function run(sql, params = []) {
    const res = await pool.query(sql, params);
    // last_insert_rowid() was used previously. In PG, we use RETURNING clause. 
    // We'll return the first row's ID if available.
    return { lastInsertRowid: res.rows[0]?.id || null };
  }

  async function get(sql, params = []) {
    const res = await pool.query(sql, params);
    return res.rows[0];
  }

  async function all(sql, params = []) {
    const res = await pool.query(sql, params);
    return res.rows;
  }

  async function exec(sql) {
    await pool.query(sql);
  }

  // Initial migration
  await migrate({ exec, get });

  return { run, get, all, exec, pool };
}

async function migrate(db) {
  // PostgreSQL syntax: SERIAL for autoincrement
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      login TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      verified_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      audio_path TEXT NULL,
      video_path TEXT NULL,
      avatar_path TEXT NULL,
      bg_color TEXT NULL,
      case_text TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Email verifications table is mentioned in previous code, let's keep it schema-ready
  await db.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Add columns if they missed (migration support)
  const cols = ["avatar_path", "bg_color", "case_text"];
  for (const col of cols) {
    try { 
      await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} TEXT NULL`);
    } catch(e) {
      // In PG, ADD COLUMN IF NOT EXISTS requires PG 9.6+.
    }
  }
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

async function ensureUniqueSlug(db, base) {
  let slug = base || "user";
  let i = 0;
  while (await db.get("SELECT 1 FROM users WHERE slug = $1 LIMIT 1", [slug])) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

module.exports = { openDb, nowIso, slugify, ensureUniqueSlug };
