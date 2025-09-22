# Disaster Management (PWA)

A simple, single‑page web app for community disaster management: view alerts, report incidents, find nearby resources, coordinate volunteers, and learn do's & don'ts.

## Quick start

- Open `landing.html` in your browser for the new first‑time experience, or serve locally:

```powershell
# Using Node.js
npx serve .

# Or using Python
python -m http.server 8000
```

Then visit `http://localhost:8000`.

Entry and auth flow
- Start at `landing.html` (welcome page)
- Click `Get Started` to go to `auth.html?mode=signup` or `Log In` to go to `auth.html?mode=login`
- After mock login/signup, you will be redirected to `index.html` (dashboard)



## Features

- Multi-hazard alerts and filters
- Incident reporting and verification (demo data)
- Shelters/resources and basic mapping placeholder
- Volunteers and task assignment (demo)
- Do's & Don'ts with short videos

## Project structure

- `index.html` – main UI
- `landing.html` – landing page (first visit)
- `auth.html` – login/signup page
- `assets/styles.css` – styles
- `assets/app.js` – app logic and demo data
- `assets/landing.css`, `assets/landing.js` – landing styles and minimal interactions
- `assets/auth.css`, `assets/auth.js` – authentication styles and minimal interactions
- `assets/icons/`, `assets/videos/`, `assets/images/` – assets

