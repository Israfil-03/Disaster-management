import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

// Prefer DATABASE_URL when provided (e.g., managed Postgres), otherwise use discrete vars
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000, ssl: /amazonaws|azure|heroku|render|neon|supabase/i.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : undefined })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'aadhya_path',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
    });

export async function healthCheck() {
  const res = await pool.query('SELECT 1 as ok');
  return res.rows[0]?.ok === 1;
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
