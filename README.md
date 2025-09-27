# AadhyaPath — PWA

## Local development
## Deployment

### Frontend on GitHub Pages

This repo includes a GitHub Actions workflow (`.github/workflows/gh-pages.yml`) that publishes the static site to GitHub Pages on pushes to `main`.

Steps:
- In GitHub → Settings → Pages, set Source to "GitHub Actions".
- Push to `main` (or run the workflow manually).
- Your site will be available at `https://<username>.github.io/<repo>/`.

### Backend (Auth APIs)

GitHub Pages is static-only, so the auth APIs must run on a separate host (Render, Railway, Azure, AWS, etc.). The server supports:
- `DATABASE_URL` or discrete `PG*` env vars
- `CORS_ORIGINS` to restrict allowed web origins (comma-separated)

After you deploy the backend, set the frontend to target that API by one of the following:
- Add a `<meta name="api-base" content="https://your-api.example.com">` tag in `auth.html` and `AadhyaPath_dashboard.html`, or
- Set `window.__API_BASE__ = 'https://your-api.example.com'` before loading `assets/config.js`.

By default, when running locally, the frontend uses `http://localhost:5174` as API base.
# AadhyaPath (PWA)

A single‑page crisis information and resilience app: view alerts, report incidents, find nearby resources, coordinate volunteers, and learn do's & don'ts.

## Quick start

- Open `index.html` in your browser for the new first‑time experience (landing), or serve locally:

```powershell
# Using Node.js
npx serve .

# Or using Python
python -m http.server 8000
```

Then visit `http://localhost:8000`.

Entry and auth flow
- Start at `index.html` (informational landing)
- Choose `Create your account` to go to `auth.html?mode=signup` or `I already have an account` to go to `auth.html?mode=login`
- After signup/login, you will be redirected to `AadhyaPath_dashboard.html` (dashboard). Direct access to the dashboard is gated.



## Features

- Multi-hazard alerts and filters (now includes slow-onset hazards: Air Pollution, Land Degradation, Sea Level Rise)
- Incident reporting and verification (demo data)
- Shelters/resources and map placeholders on Alerts and Report pages
- Volunteers and task assignment (demo)
- Do's & Don'ts with short videos

## Project structure

- `index.html` – landing page (first visit)
- `AadhyaPath_dashboard.html` – main UI (Dashboard)
- `auth.html` – login/signup page
- `assets/styles.css` – styles
- `assets/app.js` – app logic and demo data
- `assets/landing.css`, `assets/landing.js` – landing styles and minimal interactions
- `assets/auth.css`, `assets/auth.js` – authentication styles and minimal interactions
- `assets/icons/`, `assets/videos/`, `assets/images/` – assets


## PWA (Installable, offline)

- We ship a `manifest.webmanifest` and `service-worker.js` with precache + runtime caching.
- To test installability, serve over `https://` or `http://localhost` and open DevTools → Application → Manifest.
- Offline: disconnect the network and reload — the Offline page will appear for navigations and cached pages/assets will still load.

Notes
- Map tiles from OpenStreetMap and Leaflet CDN are cached with a stale‑while‑revalidate strategy when online; they may not be available on a cold offline start if not previously viewed.
- Large videos are streamed (Range requests) and not aggressively cached to avoid storage bloat.

# Disaster-Management

## Database Setup & Troubleshooting

### PostgreSQL Setup

For full functionality, you'll need PostgreSQL running locally:

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # macOS (using Homebrew)
   brew install postgresql
   brew services start postgresql
   
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   
   # Windows
   # Download and install from: https://www.postgresql.org/download/windows/
   ```

2. **Create Database** (optional - auto-created if missing):
   ```bash
   createdb aadhyapath
   # OR
   cd server && npm run db:create
   ```

3. **Configure Environment** (server/.env):
   ```env
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=aadhyapath
   PGUSER=postgres
   PGPASSWORD=your_password_here
   ```

### Without Database

The application will still work without PostgreSQL:
- Frontend loads and functions correctly
- Authentication falls back to local storage
- Demo data provides full UI functionality
- Some server API calls will fail gracefully

### Common Issues & Solutions

**Error: "ECONNREFUSED ::1:5432"**
- PostgreSQL is not running or not accessible
- Check if PostgreSQL service is started
- Verify connection details in server/.env

**Firebase Analytics Errors**
- Normal in development environments
- Analytics will be disabled automatically
- No impact on core functionality

**"API_BASE not set" Warning**
- For local development, this is expected
- For production, set the meta tag in HTML files

### Development Workflow

1. **Frontend only** (no database needed):
   ```bash
   python -m http.server 8080
   # OR
   npx serve .
   ```

2. **Full stack** (with database):
   ```bash
   # Terminal 1: Start backend
   cd server && npm install && npm start
   
   # Terminal 2: Start frontend
   python -m http.server 8080
   ```
```

By default, the server hosts the frontend at `http://localhost:5174/` and APIs under `/api/*`.

Auth endpoints:
- `POST /api/auth/signup` — body: `{ name, email, password }`
- `POST /api/auth/login` — body: `{ email, password }`

Notes:
- The backend prefers a `password_hash` column in `login`. If only `password` exists, it will store plaintext as a backwards-compatible fallback and return a warning. Consider migrating to hashed passwords.

