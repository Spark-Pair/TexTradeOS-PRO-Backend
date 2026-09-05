import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const databasePath = path.resolve(
  process.env.DATABASE_PATH || path.resolve(process.cwd(), "textradeos.sqlite")
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
export const isFreshDatabase = !fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0;

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 10000");
db.pragma("synchronous = NORMAL");
