-- Create volunteer_applications table if it doesn't exist
create table if not exists public.volunteer_applications (
  id bigserial primary key,
  full_name text not null,
  email text not null,
  phone text,
  skills jsonb default '[]'::jsonb,
  availability text,
  preferred_location text,
  motivation text,
  status text not null default 'pending',
  action_status text default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  notes text,
  created_by uuid references auth.users(id),
  notification_sent_at timestamptz
);

-- Add indexes for better performance
create index if not exists idx_volunteer_applications_status on public.volunteer_applications(status);
create index if not exists idx_volunteer_applications_created_at on public.volunteer_applications(created_at desc);
create index if not exists idx_volunteer_applications_email on public.volunteer_applications(email);

-- Enable RLS
alter table public.volunteer_applications enable row level security;

-- Policies for volunteer applications
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='volunteer_applications' and policyname='volunteer_applications_read') then
    create policy "volunteer_applications_read" on public.volunteer_applications 
    for select using (auth.role() = 'authenticated');
  end if;
  
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='volunteer_applications' and policyname='volunteer_applications_insert') then
    create policy "volunteer_applications_insert" on public.volunteer_applications 
    for insert with check (auth.role() = 'authenticated');
  end if;
  
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='volunteer_applications' and policyname='volunteer_applications_update') then
    create policy "volunteer_applications_update" on public.volunteer_applications 
    for update using (auth.role() = 'authenticated');
  end if;
end $$;

-- Enable realtime for volunteer applications
do $$ begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname='supabase_realtime' 
    and schemaname='public' 
    and tablename='volunteer_applications'
  ) then
    alter publication supabase_realtime add table public.volunteer_applications;
  end if;
end $$;

-- Function to automatically update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at
drop trigger if exists update_volunteer_applications_updated_at on public.volunteer_applications;
create trigger update_volunteer_applications_updated_at
  before update on public.volunteer_applications
  for each row execute function public.update_updated_at_column();