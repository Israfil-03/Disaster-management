-- Add missing contact field to reports table if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'reports' 
    and column_name = 'contact'
  ) then
    alter table public.reports add column contact text;
  end if;
end $$;

-- Add missing created_by field to reports table if it doesn't exist  
do $$ begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'reports' 
    and column_name = 'created_by'
  ) then
    alter table public.reports add column created_by uuid references auth.users(id);
  end if;
end $$;