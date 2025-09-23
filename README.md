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

