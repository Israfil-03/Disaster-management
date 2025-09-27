// Ensure database folder structure and default db file
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'database');
const dbFile = path.join(dbDir, 'app.db');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, '');
  console.log('Created database/app.db');
}