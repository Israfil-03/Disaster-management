const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK(role in ('citizen','authority','ngo','ndrf')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now')),
  hazard TEXT,
  severity TEXT,
  message TEXT,
  state TEXT,
  district TEXT,
  area TEXT,
  lat REAL,
  lng REAL,
  author_id INTEGER,
  FOREIGN KEY(author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now')),
  type TEXT,
  description TEXT,
  location TEXT,
  contact TEXT,
  status TEXT DEFAULT 'Pending',
  citizen_id INTEGER,
  FOREIGN KEY(citizen_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shelters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  capacity INTEGER,
  available INTEGER,
  contact TEXT
);
`);

module.exports = db;