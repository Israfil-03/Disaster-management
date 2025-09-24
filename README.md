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

- **Multi-language support**: Full interface available in English, Hindi (हिन्दी), and Bengali (বাংলা)
- Multi-hazard alerts and filters (now includes slow-onset hazards: Air Pollution, Land Degradation, Sea Level Rise)
- Incident reporting and verification (demo data)
- Shelters/resources and map placeholders on Alerts and Report pages
- Volunteers and task assignment (demo)
- Do's & Don'ts with short videos

## Multi-Language Support

AadhyaPath supports multiple languages to ensure accessibility for diverse communities:

### Supported Languages
- **English** (en) - Default language
- **Hindi** (हिन्दी) (hi) - Complete interface translation
- **Bengali** (বাংলা) (bn) - Complete interface translation

### How Language Support Works
1. **Language Selection**: Use the language dropdown in the dashboard header to switch between languages
2. **Automatic Detection**: The app detects your browser's language preference on first visit
3. **Persistent Preference**: Your language choice is saved in localStorage and applied across all pages
4. **Complete Coverage**: All UI elements, buttons, labels, and content are translated

### Language Switching
- Navigate to the dashboard (`AadhyaPath_dashboard.html`)
- Use the language selector dropdown in the top-right header
- Select your preferred language (English, हिन्दी, or বাংলা)
- The interface updates immediately and your preference is saved

### Technical Implementation
- Translation system uses `assets/i18n.js` with comprehensive message catalogs
- HTML elements use `data-i18n` attributes for automatic translation
- Language preferences persist via localStorage integration
- All pages (landing, auth, dashboard) support internationalization

### Adding New Languages
To add support for additional languages:
1. Add language entries to the `messages` object in `assets/i18n.js`
2. Add the new language option to the language selector in `AadhyaPath_dashboard.html`
3. Translate all message keys to maintain complete coverage
4. Test language switching and persistence functionality

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

