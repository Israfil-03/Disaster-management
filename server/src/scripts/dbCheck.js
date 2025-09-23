import { pool, ensureUsersTable, healthCheck } from '../lib/db.js';

async function main() {
  console.log('DB health:', await healthCheck().catch((e) => ({ error: e.message })));
  await ensureUsersTable();
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`
  );
  console.table(cols.rows);
  await pool.end();
}

main().catch((e) => {
  console.error('DB check failed:', e);
  process.exit(1);
});
