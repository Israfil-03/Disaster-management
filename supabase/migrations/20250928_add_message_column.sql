-- Compatibility migration: ensure 'message' column exists for alerts
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='alerts' and column_name='message'
  ) then
    alter table public.alerts add column message text;
  end if;
end $$;

-- Optional trigger to keep msg and message in sync (one-way copy on insert/update)
-- Only create the sync trigger when BOTH columns exist
do $$
declare
  has_msg boolean;
  has_message boolean;
begin
  select exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='alerts' and column_name='msg'
  ) into has_msg;
  select exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='alerts' and column_name='message'
  ) into has_message;

  if has_msg and has_message then
    if not exists (
      select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid
      where n.nspname='public' and p.proname='alerts_sync_msg_message'
    ) then
      create function public.alerts_sync_msg_message() returns trigger as $$
      begin
        if NEW.message is null and NEW.msg is not null then NEW.message := NEW.msg; end if;
        if NEW.msg is null and NEW.message is not null then NEW.msg := NEW.message; end if;
        return NEW;
      end;
      $$ language plpgsql;
    end if;

    if not exists (
      select 1 from pg_trigger t join pg_class c on t.tgrelid=c.oid join pg_namespace n on c.relnamespace=n.oid
      where n.nspname='public' and c.relname='alerts' and t.tgname='tr_alerts_sync_msg_message'
    ) then
      create trigger tr_alerts_sync_msg_message
        before insert or update on public.alerts
        for each row execute function public.alerts_sync_msg_message();
    end if;
  end if;
end $$;
