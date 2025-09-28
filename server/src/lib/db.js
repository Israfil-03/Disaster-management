import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

const shouldUsePgMem = String(process.env.USE_PG_MEM || '').toLowerCase() === 'true'
  || String(process.env.USE_PG_MEM || '') === '1'
  || process.env.NODE_ENV === 'test';

let poolInstance;

if (shouldUsePgMem) {
  const { newDb } = await import('pg-mem');
  const pgMem = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  // Align NOW() usage with pg
  pgMem.public.registerFunction({ name: 'now', returns: 'timestamp', implementation: () => new Date() });
  pgMem.public.registerFunction({ name: 'current_timestamp', returns: 'timestamp', implementation: () => new Date() });
  const { Pool: MemPool } = pgMem.adapters.createPg();
  poolInstance = new MemPool();
} else {
  // Prefer pooled DATABASE_URL, then DIRECT_URL, otherwise use discrete vars
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  poolInstance = connectionString
    ? new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        ssl: /amazonaws|azure|heroku|render|neon|supabase/i.test(connectionString) ? { rejectUnauthorized: false } : undefined,
      })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'aadhyapath',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD,
        max: 10,
        idleTimeoutMillis: 30000,
      });
}

export const pool = poolInstance;
export const usingPgMem = shouldUsePgMem;

export async function healthCheck() {
  const res = await pool.query('SELECT 1 as ok');
  return res.rows[0]?.ok === 1;
}

export async function closePool() {
  if (typeof pool?.end === 'function') {
    await pool.end();
  }
}

// Ensure users table exists to match project schema (non-destructive)
export async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE
    );
  `);
}

export async function ensureVolunteerTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_applications (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      phone VARCHAR(32),
      skills TEXT[] NOT NULL,
      availability VARCHAR(120) NOT NULL,
      preferred_location VARCHAR(160),
      motivation TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by VARCHAR(120),
      notification_sent_at TIMESTAMPTZ,
      notes TEXT
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_volunteer_applications_status ON volunteer_applications(status);');
}
