import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Client } = pkg;

async function ensureDatabase() {
  const host = process.env.PGHOST || 'localhost';
  const port = Number(process.env.PGPORT || 5432);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const dbName = process.env.PGDATABASE || 'aadhyapath';

  // Connect to the default 'postgres' database to manage other DBs
  const adminClient = new Client({ host, port, user, password, database: 'postgres' });
  await adminClient.connect();
  try {
    const existsRes = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existsRes.rowCount) {
      console.log(`Database '${dbName}' already exists.`);
      return;
    }
    // Create database with UTF8 encoding
    await adminClient.query(`CREATE DATABASE ${dbName} WITH ENCODING 'UTF8' TEMPLATE template1`);
    console.log(`Database '${dbName}' created.`);
  } finally {
    await adminClient.end();
  }
}

ensureDatabase().catch((e) => {
  console.error('Failed to create database:', e.message);
  process.exit(1);
});
