-- Supabase database schema for AadhyaPath (profiles, alerts, reports) with RLS policies.
-- Apply with: supabase db push

-- Note: This script assumes the standard Supabase 'auth' schema exists with 'auth.users'.

create schema if not exists public;

-- 1) profiles: basic user profile aligned with app's expectations
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (lower(role) in ('citizen','authority','ngo','ndrf')) default 'citizen',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read/update/insert only their own profile row
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles select own'
  ) then
    create policy "Profiles select own" on public.profiles
      for select using (id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles insert own'
  ) then
    create policy "Profiles insert own" on public.profiles
      for insert with check (id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles update own'
  ) then
    create policy "Profiles update own" on public.profiles
      for update using (id = auth.uid()) with check (id = auth.uid());
  end if;
end $$;

-- 2) alerts: authority/NDRF can broadcast; everyone authenticated can read
create table if not exists public.alerts (
  id bigint generated always as identity primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  hazard text not null,
  severity text check (severity in ('Low','Medium','High','Severe')) not null,
  message text not null,
  state_name text,
  district text,
  area text,
  lat double precision,
  lng double precision
);

alter table public.alerts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='Alerts select authenticated'
  ) then
    create policy "Alerts select authenticated" on public.alerts
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='Alerts insert by authority/ndrf'
  ) then
    create policy "Alerts insert by authority/ndrf" on public.alerts
      for insert with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and lower(p.role) in ('authority','ndrf')
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='Alerts update by authority/ndrf'
  ) then
    create policy "Alerts update by authority/ndrf" on public.alerts
      for update using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and lower(p.role) in ('authority','ndrf')
        )
      );
  end if;
end $$;

create index if not exists alerts_created_at_idx on public.alerts(created_at desc);

-- 3) reports: citizens create, authority/NDRF verify; everyone authenticated can read
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null,
  description text,
  location text not null,
  contact text,
  status text not null default 'Pending' check (status in ('Pending','Verified','Rejected'))
);

alter table public.reports enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='Reports select authenticated'
  ) then
    create policy "Reports select authenticated" on public.reports
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='Reports insert by authenticated'
  ) then
    create policy "Reports insert by authenticated" on public.reports
      for insert with check (auth.uid() is not null);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='Reports update by authority/ndrf'
  ) then
    create policy "Reports update by authority/ndrf" on public.reports
      for update using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and lower(p.role) in ('authority','ndrf')
        )
      );
  end if;
end $$;

create index if not exists reports_created_at_idx on public.reports(created_at desc);
