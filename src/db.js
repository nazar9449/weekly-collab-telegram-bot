import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL in environment.");
}

const disableSsl = String(process.env.PGSSL_DISABLE || "").toLowerCase() === "true";

export const pool = new Pool({
  connectionString,
  ssl: disableSsl ? false : { rejectUnauthorized: false }
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      owner_tg_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      tg_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT NOT NULL,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      invite_code TEXT NOT NULL UNIQUE,
      buddy_code TEXT UNIQUE,
      buddy_tg_id TEXT REFERENCES users(tg_id),
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_tg_id TEXT NOT NULL REFERENCES users(tg_id),
      week_key TEXT NOT NULL,
      title TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_metrics (
      id SERIAL PRIMARY KEY,
      user_tg_id TEXT NOT NULL REFERENCES users(tg_id),
      week_key TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(user_tg_id, week_key)
    );
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS buddy_code TEXT UNIQUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS buddy_tg_id TEXT REFERENCES users(tg_id)`);
}
