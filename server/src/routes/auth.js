import express from 'express';
import bcrypt from 'bcrypt';
import { pool, ensureUsersTable } from '../lib/db.js';

const router = express.Router();

// Make sure users table exists (best-effort)
ensureUsersTable().catch((e) => {
  console.error('Failed to ensure users table:', e);
});

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Full name, email and password are required.' });
    }

    const hash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        'INSERT INTO users(full_name, email, password_hash) VALUES($1,$2,$3) RETURNING id, full_name, email, created_at',
        [name, email, hash]
      );
      return res.json({ user: rows[0] });
    } catch (err) {
      if ((err?.code === '23505') || /duplicate key value violates unique constraint/i.test(err?.message || '')) {
        return res.status(409).json({ error: 'Email already exists.' });
      }
      throw err;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await pool.query('SELECT id, full_name, email, password_hash, is_active FROM users WHERE email = $1 LIMIT 1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Account is inactive. Contact support.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    // Update last_login
    try { await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]); } catch {}

    // For simplicity, return a minimal session-like payload; JWT can be added later
    res.json({
      user: { name: user.full_name, email: user.email, id: user.id },
      message: 'Login successful',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
