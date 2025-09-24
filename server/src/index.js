import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import { healthCheck as dbHealthCheck } from './lib/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow same-origin or curl
    if (allowedOrigins.length === 0) return cb(null, true); // default permissive for local dev if not set
    const ok = allowedOrigins.some((o) => o === origin);
    cb(ok ? null : new Error('CORS not allowed'), ok);
  },
  credentials: true,
}));
app.use(express.json());

// API routes
app.use('/api/auth', authRouter);

// Health endpoint including DB status
app.get('/api/health', async (req, res) => {
  let db = false;
  try { db = await dbHealthCheck(); } catch {}
  res.json({ status: 'ok', db, time: new Date().toISOString() });
});

// Serve static frontend from project root so you can hit /auth.html etc.
const projectRoot = path.resolve(__dirname, '../../');
app.use(express.static(projectRoot));

// Fallback to index.html for unknown routes under root (optional)
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'index.html'));
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
