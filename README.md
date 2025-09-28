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
- Volunteers and task assignment, now with end-to-end registration + admin approvals
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
## Supabase setup (database, realtime, RLS)

We migrated the app from Firebase to Supabase. To initialize the database and realtime policies:

1) Install Supabase CLI
	- Windows (PowerShell): `iwr https://repo.supabase.com/install/windows.ps1 -useb | iex`

2) Login and link your project
	- `supabase login`
	- `supabase link --project-ref itniteawqzjuympwxorv` (replace with your project ref if different)

3) Push the migration
	- From the project root (this folder): `supabase db push`

This applies `supabase/migrations/20250928_init.sql` which:
	- Creates tables: alerts, reports, chat, profiles
	- Enables Row Level Security and basic authenticated policies
	- Adds tables to `supabase_realtime` publication for realtime updates

4) In Supabase Dashboard
	- Enable Email/Password auth provider (Authentication > Providers)
	- Under Database > Replication, confirm the above tables are included in `supabase_realtime`

5) Configure local `.env`
	- Copy `server/.env.example` to `server/.env`.
	- For Supabase production hosting, set both pooled and direct URLs:
	  - `DATABASE_URL=postgresql://postgres.itniteawqzjuympwxorv:Your%40Password@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
	  - `DIRECT_URL=postgresql://postgres.itniteawqzjuympwxorv:Your%40Password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
	- Replace `Your%40Password` with your actual password, URL-encoding any special characters (`@` → `%40`, `:` → `%3A`, etc.).
	- Provide the Supabase JWT secret (`SUPABASE_JWT_SECRET`) so the backend can verify dashboard tokens, and keep it private.
	- Expose the public browser values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) if you prefer not to use the default meta tags.

6) Run locally
	- In `server/`, `npm install` then `npm start`

Troubleshooting
	- If records appear then disappear on refresh, ensure the tables exist and you are logged in (RLS requires `authenticated`).
	- If realtime doesn’t fire, confirm the tables are in the `supabase_realtime` publication and you used the anon public key on the frontend.
	- If server cannot connect, verify DNS/vpn/firewall and that `sslmode=require` is used by default in driver (pg). The code enables SSL by default for managed hosts.


## Local backend (Node + PostgreSQL)

This project now includes a minimal Node/Express backend with PostgreSQL for authentication.

Prereqs:
- PostgreSQL running locally with a database `aadhya_path` and a `login` table (created automatically if missing)
- Node.js 18+

Configure environment:
1. Copy `server/.env.example` to `server/.env`
2. Update `PGPASSWORD` with your local password

Install deps and run:

```
cd server
npm install
npm run start
```

By default, the server hosts the frontend at `http://localhost:5174/` and APIs under `/api/*`.

Auth endpoints:
- `POST /api/auth/signup` — body: `{ name, email, password }`
- `POST /api/auth/login` — body: `{ email, password }`

Notes:
- The backend prefers a `password_hash` column in `login`. If only `password` exists, it will store plaintext as a backwards-compatible fallback and return a warning. Consider migrating to hashed passwords.

### Volunteer application APIs

The dashboard now submits volunteer registrations to the backend and exposes review endpoints:

- `POST /api/volunteers/apply` — anonymous submission of `{ fullName, email, phone, skills[], availability, preferredLocation?, motivation? }`
- `GET /api/volunteers` — public list of approved volunteers (sanitized; no contact info)
- `GET /api/volunteers/applications` — **admin only** (requires Supabase JWT) list of pending applications
- `PATCH /api/volunteers/:id/status` — **admin only** approve/reject with optional notes, automatically notifies the applicant

To enable the admin endpoints, set `SUPABASE_JWT_SECRET` in `server/.env` (find it in Supabase → Project Settings → API). Dashboard requests include the Supabase access token, which the backend verifies against this secret before allowing approvals.

Optional email notifications use SMTP (Nodemailer). Provide `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the environment to send confirmation/approval notices. When SMTP is not configured the backend logs the intent but skips sending (so local development continues to work).

