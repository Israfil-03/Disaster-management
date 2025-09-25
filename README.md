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


## Supabase setup

1. Create a Supabase project (the dashboard link you shared already points to one) and copy the **Project URL** and **anon public key** from *Project Settings → API*.
2. Update `assets/config.js` with those values. This file is committed so that GitHub Pages can serve the static site; remember never to expose your service role key.
3. In *Authentication → URL configuration*, add the following redirect URLs so email confirmations or magic links land back on the site:
	 - `https://<your-gh-pages-username>.github.io/Disaster-Management/auth.html`
	 - `http://localhost:8000/auth.html`
4. (Optional but recommended) Disable “Confirm email” for new users if you want immediate access after sign-up. If you keep confirmation enabled, users must click the link sent by Supabase before logging in.
5. When creating accounts for different personas, pick the matching role during sign-up (`citizen`, `authority`, `ngo`, or `ndrf`). You can also edit the `profiles` table later to promote/demote a user.
6. Role-based email domains:
	- Citizen — any domain
	- Government Authority — `@gov.in`, `@nic.in`
	- NGO — `@ngo.org`
	- NDRF — `@ndrf.gov.in`
	Adjust the lists in `assets/config.js` (`window.authRoleDomains`) if your organization uses different domains.
	Example accounts for quick testing:
	- Citizen — `alex@example.com`
	- Government Authority — `officer@disaster.gov.in`
	- NGO — `coordinator@relief.ngo.org`
	- NDRF — `responder@ops.ndrf.gov.in`
	Citizen accounts must avoid official domains reserved for other roles.


## Database schema (run in Supabase SQL editor)

```sql
create table if not exists public.profiles (
	id uuid primary key references auth.users on delete cascade,
	full_name text,
	role text not null default 'citizen' check (role in ('citizen','authority','ngo','ndrf')),
	created_at timestamp with time zone default timezone('utc', now()),
	updated_at timestamp with time zone default timezone('utc', now())
);

alter table public.profiles enable row level security;

create policy if not exists "Users can manage own profile" on public.profiles
	for all
	using (auth.uid() = id)
	with check (auth.uid() = id);

create or replace function public.handle_profile_on_signup()
returns trigger as $$
begin
	insert into public.profiles (id, full_name, role)
	values (
		new.id,
		coalesce(new.raw_user_meta_data->>'full_name', new.email),
		coalesce(new.raw_user_meta_data->>'role', 'citizen')
	)
	on conflict (id) do update set
		full_name = excluded.full_name,
		role = excluded.role,
		updated_at = timezone('utc', now());
	return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_profile_on_signup();
```

- The `profiles` table stores full name and role for each user.
- Row Level Security (RLS) ensures each signed-in user can read/write only their own row.
- The trigger keeps `profiles` in sync with Supabase Auth metadata so the client does not need elevated privileges.


## Deploying to GitHub Pages

1. Commit your changes (including the filled `assets/config.js`) to the branch that GitHub Pages serves (commonly `main` or `/docs`).
2. In the repository settings, enable GitHub Pages for the appropriate branch and root folder.
3. Once published, verify that the hosted URL matches the redirect URLs configured in Supabase.
4. Whenever you rotate the anon key or change Supabase credentials, update `assets/config.js` and redeploy.



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

## Supabase integration (database-backed)

We added a first-class Supabase backend so the app can be functional with live data and real-time updates.

- `assets/config.js` initializes the client with your Project URL and anon key
- `supabase/schema.sql` defines tables and RLS policies for `profiles`, `alerts`, and `reports`
- `assets/app.js` loads/saves alerts and reports and subscribes to realtime

Setup on Windows PowerShell:

```powershell
# Install Supabase CLI (once)
iwr https://repo.supabase.com/install/cli.ps1 -useb | iex

# Authenticate
supabase login

# Link the local repo folder to your Supabase project (enter your project ref)
# (Run from the repository root that contains the supabase/ folder)
supabase link --project-ref <your-project-ref>

# Apply the schema
supabase db push
```

In the Supabase Dashboard → Authentication → URL Configuration, add these Redirect URLs:

- http://localhost:8000/auth.html
- https://<your-gh-pages-username>.github.io/Disaster-Management/auth.html

Data import/export between projects (optional):

```powershell
# Export data from source
supabase link --project-ref <source-ref>
supabase db dump --data-only --output dump.sql

# Import into target (after linking to target)
supabase link --project-ref <target-ref>
psql "$(supabase db connect)" -f dump.sql
```

Realtime: ensure Realtime is enabled for the `public` schema in the project settings. The frontend subscribes to inserts/updates on `alerts` and `reports`.

