import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "bot.db");
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  owner_tg_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  tg_id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_tg_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  title TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_tg_id) REFERENCES users(tg_id)
);

CREATE TABLE IF NOT EXISTS body_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_tg_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(user_tg_id, week_key),
  FOREIGN KEY (user_tg_id) REFERENCES users(tg_id)
);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasOnboardingColumn = userColumns.some((col) => col.name === "onboarding_completed");
if (!hasOnboardingColumn) {
  db.exec("ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0");
}
