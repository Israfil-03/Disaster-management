-- Create core tables
create table if not exists public.alerts (
  id bigserial primary key,
  hazard text not null,
  sev text not null default 'Low',
  msg text not null,
  state text,
  district text,
  area text,
  lat double precision,
  lng double precision,
  ts timestamptz not null default now()
);

create table if not exists public.reports (
  id bigserial primary key,
  type text not null,
  "desc" text not null,
  loc text not null,
  status text not null default 'Pending',
  ts timestamptz not null default now()
);

create table if not exists public.chat (
  id bigserial primary key,
  text text not null,
  "user" text not null,
  role text,
  ts timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  email text unique,
  display_name text,
  role text default 'citizen',
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.alerts enable row level security;
alter table public.reports enable row level security;
alter table public.chat enable row level security;
alter table public.profiles enable row level security;

-- Policies (basic authenticated access)
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_read') then
    create policy "alerts_read" on public.alerts for select using (auth.role() = 'authenticated');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='alerts' and policyname='alerts_insert') then
    create policy "alerts_insert" on public.alerts for insert with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_read') then
    create policy "reports_read" on public.reports for select using (auth.role() = 'authenticated');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_insert') then
    create policy "reports_insert" on public.reports for insert with check (auth.role() = 'authenticated');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_update') then
    create policy "reports_update" on public.reports for update using (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat' and policyname='chat_read') then
    create policy "chat_read" on public.chat for select using (auth.role() = 'authenticated');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat' and policyname='chat_insert') then
    create policy "chat_insert" on public.chat for insert with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_upsert_own') then
    create policy "profiles_upsert_own" on public.profiles for insert with check (auth.uid() = id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
  end if;
end $$;

-- Enable Realtime (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat'
  ) then
    alter publication supabase_realtime add table public.chat;
  end if;
end $$;