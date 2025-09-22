# AadhyaPath - Leading the Path to Safety

A comprehensive disaster management platform for community preparedness, response, and recovery. Handle multiple disaster types including natural calamities and silent disasters like pollution and medical emergencies.

## Quick start

- Open `landing.html` in your browser to start, or serve locally:

```powershell
# Using Node.js
npx serve .

# Or using Python
python -m http.server 8000
```

Then visit `http://localhost:8000/landing.html`.

## Authentication Flow

Users must follow the proper authentication flow:
1. Start at the landing page (`landing.html`)
2. Register or login through the authentication page (`auth.html`)
3. Access the dashboard (`index.html`) only after authentication

Direct access to the dashboard is prevented for security.

## Features

- **Comprehensive Alert System**: Multi-hazard alerts including silent disasters (pollution, medical emergencies, infrastructure failures)
- **Interactive Maps**: Visual representation of alert locations and incident reports
- **Incident reporting and verification**: Community-driven reporting with authority verification
- **Shelter and resource mapping**: Find nearby resources and emergency facilities
- **Volunteer coordination**: Task assignment and volunteer management
- **Educational Resources**: Do's & Don'ts with instructional videos
- **Multi-language support**: Available in 10+ Indian languages

## Project structure

- `landing.html` – informative landing page with achievements and features
- `auth.html` – authentication (login/signup) page
- `index.html` – main dashboard UI
- `assets/landing.css` – landing page styles
- `assets/auth.css` – authentication page styles
- `assets/styles.css` – main dashboard styles
- `assets/app.js` – dashboard logic and demo data
- `assets/auth.js` – authentication logic
- `assets/landing.js` – landing page logic
- `assets/icons/`, `assets/videos/`, `assets/images/` – static assets

