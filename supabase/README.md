# Supabase for AadhyaPath

This folder contains the database schema for the Supabase project (PostgreSQL). It creates the following tables and RLS policies:

- profiles: user profile synchronized with auth.users
- alerts: broadcast alerts (insert/update by authority or ndrf; read by all authenticated)
- reports: citizen reports (insert by any authenticated; status update by authority or ndrf; read by all authenticated)

## Prerequisites

- Node.js and the Supabase CLI installed
- Supabase project URL and anon key configured in `assets/config.js` (already present)

## Apply schema to your Supabase project

On Windows PowerShell:

```powershell
# Install Supabase CLI (if not installed)
iwr https://repo.supabase.com/install/cli.ps1 -useb | iex

# Login to Supabase
supabase login

# Link your local folder to the target Supabase project (enter your project ref when prompted)
cd ..\..
cd .\
# Make sure you run this from the repo root (contains the supabase folder)
supabase link --project-ref <your-project-ref>

# Push the SQL schema
supabase db push
```

If you prefer, you can run the schema manually in the SQL editor of the Supabase dashboard by copying the contents of `schema.sql`.

## Realtime

The schema uses standard tables that are compatible with Supabase Realtime. Ensure Realtime is enabled for your project (it is by default). In the Dashboard → Realtime, make sure `public` schema is enabled.

## Policies

- profiles: users can read/insert/update their own row
- alerts: any authenticated can read; only authority/ndrf (based on `profiles.role`) can insert/update
- reports: any authenticated can read/insert; only authority/ndrf can update status

You can tune the allowed roles by editing the checks in `schema.sql`.
