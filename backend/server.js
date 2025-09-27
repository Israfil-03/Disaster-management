require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const db = require('./db');
const { hashSync, compareSync } = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*'},
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Static frontend (serve repository root)
const rootDir = path.join(__dirname, '..');
app.use('/', express.static(rootDir));

// Utility helpers
function createToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function authGuard(req, res, next){
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.cookies.token || null);
  if(!token) return res.status(401).json({ error: 'Missing token' });
  try{
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  }catch(err){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Seed minimal shelters on first run if table empty
(function seed(){
  const count = db.prepare('SELECT COUNT(*) AS c FROM shelters').get().c;
  if(count === 0){
    const ins = db.prepare('INSERT INTO shelters (name, capacity, available, contact) VALUES (?,?,?,?)');
    [['Govt School Hall',150,95,'080-123456'],['Panchayat Bhawan',200,130,'080-223344'],['Community Centre',120,70,'080-445566']]
      .forEach(x=> ins.run(...x));
    console.log('Seeded shelters');
  }
})();

// Socket.IO: track connections
io.on('connection', (socket)=>{
  // Optionally authenticate per-socket via token query
  const { token } = socket.handshake.auth || {};
  let user = null;
  if(token){
    try{ user = jwt.verify(token, JWT_SECRET); }catch{}
  }
  socket.data.user = user;
  socket.join('all');
  if(user){ socket.join(`role:${user.role}`); socket.join(`user:${user.id}`); }

  socket.on('disconnect', ()=>{});
});

function emitAlertCreated(alert){
  io.to('all').emit('alert:created', alert);
}
function emitReportCreated(report){
  io.to('all').emit('report:created', report);
}
function emitReportUpdated(report){
  io.to('all').emit('report:updated', report);
}

// Routes
app.get('/api/health', (req,res)=> res.json({ ok: true }));

// Auth
app.post('/api/auth/signup', (req,res)=>{
  const { email, password, full_name, role } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const r = (role||'citizen').toLowerCase();
  if(!['citizen','authority','ngo','ndrf'].includes(r)) return res.status(400).json({ error: 'Invalid role' });
  try{
    const stmt = db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)');
    const password_hash = hashSync(password, 10);
    const info = stmt.run(email.toLowerCase(), password_hash, full_name || '', r);
    const user = { id: info.lastInsertRowid, email: email.toLowerCase(), full_name: full_name||'', role: r };
    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true });
    res.json({ token, user });
  }catch(err){
    if(String(err.message||'').includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    console.error(err); return res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if(!row) return res.status(401).json({ error: 'Invalid credentials' });
  if(!compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: row.id, email: row.email, full_name: row.full_name, role: row.role };
  const token = createToken(user);
  res.cookie('token', token, { httpOnly: true });
  res.json({ token, user });
});

app.get('/api/auth/me', authGuard, (req,res)=>{
  const { id } = req.user;
  const row = db.prepare('SELECT id,email,full_name,role FROM users WHERE id = ?').get(id);
  if(!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: row });
});

app.post('/api/auth/logout', (req,res)=>{
  res.clearCookie('token');
  res.json({ ok: true });
});

// Alerts
app.get('/api/alerts', (req,res)=>{
  const rows = db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

app.post('/api/alerts', authGuard, (req,res)=>{
  const { hazard, severity, message, state, district, area, lat, lng } = req.body || {};
  const role = req.user.role;
  if(!['authority','ndrf'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  const stmt = db.prepare(`INSERT INTO alerts (hazard,severity,message,state,district,area,lat,lng,author_id) VALUES (?,?,?,?,?,?,?,?,?)`);
  const info = stmt.run(hazard||'', severity||'', message||'', state||'', district||'', area||'', lat||null, lng||null, req.user.id);
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid);
  emitAlertCreated(alert);
  res.json({ item: alert });
});

// Reports
app.get('/api/reports', (req,res)=>{
  const rows = db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

app.post('/api/reports', authGuard, (req,res)=>{
  const { type, description, location, contact } = req.body || {};
  if(!type || !description || !location) return res.status(400).json({ error: 'Missing fields' });
  const stmt = db.prepare('INSERT INTO reports (type,description,location,contact,citizen_id) VALUES (?,?,?,?,?)');
  const info = stmt.run(type, description, location, contact||'', req.user.id);
  const item = db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
  emitReportCreated(item);
  res.json({ item });
});

app.patch('/api/reports/:id', authGuard, (req,res)=>{
  const { id } = req.params;
  const { status } = req.body || {};
  if(!['authority','ndrf'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const get = db.prepare('SELECT * FROM reports WHERE id = ?');
  const row = get.get(id);
  if(!row) return res.status(404).json({ error: 'Not found' });
  const upd = db.prepare('UPDATE reports SET status = ? WHERE id = ?');
  upd.run(status||'Pending', id);
  const updated = get.get(id);
  emitReportUpdated(updated);
  res.json({ item: updated });
});

// Shelters
app.get('/api/shelters', (req,res)=>{
  const rows = db.prepare('SELECT * FROM shelters').all();
  res.json({ items: rows });
});

// Fallback to index for SPA routes
app.get('*', (req,res)=>{
  const p = path.join(rootDir, 'index.html');
  if(fs.existsSync(p)) return res.sendFile(p);
  res.status(404).send('Not found');
});

server.listen(PORT, ()=>{
  console.log(`Server running at http://localhost:${PORT}`);
});
