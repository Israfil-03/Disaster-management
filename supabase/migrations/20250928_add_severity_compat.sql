-- Compatibility migration: ensure 'severity' column exists and mirrors 'sev'
-- 1) Add 'severity' if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'alerts' AND c.column_name = 'severity'
  ) THEN
    ALTER TABLE public.alerts ADD COLUMN severity text;
  END IF;
END $$;

-- 2) Backfill severity from sev if sev exists and severity is null
UPDATE public.alerts SET severity = COALESCE(severity, sev) WHERE severity IS NULL;

-- 3) Create triggers to keep sev <-> severity in sync (idempotent)
DO $$
BEGIN
  -- function to sync into severity when sev changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='alerts_sync_sev_to_severity'
  ) THEN
    CREATE FUNCTION public.alerts_sync_sev_to_severity() RETURNS trigger AS $$
    BEGIN
      IF NEW.severity IS DISTINCT FROM NEW.sev THEN
        NEW.severity := NEW.sev;
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
  END IF;

  -- function to sync into sev when severity changes (if sev column exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='alerts_sync_severity_to_sev'
  ) THEN
    CREATE FUNCTION public.alerts_sync_severity_to_sev() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alerts' AND column_name='sev'
      ) THEN
        IF NEW.sev IS DISTINCT FROM NEW.severity THEN
          NEW.sev := NEW.severity;
        END IF;
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
  END IF;

  -- attach trigger for BEFORE INSERT OR UPDATE to sync both ways (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='alerts' AND t.tgname='tr_alerts_sync_sev_severity'
  ) THEN
    CREATE TRIGGER tr_alerts_sync_sev_severity
    BEFORE INSERT OR UPDATE ON public.alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.alerts_sync_sev_to_severity();
  END IF;

  -- optional second trigger to mirror reverse direction (no-op if sev absent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='alerts' AND t.tgname='tr_alerts_sync_severity_sev'
  ) THEN
    CREATE TRIGGER tr_alerts_sync_severity_sev
    BEFORE INSERT OR UPDATE ON public.alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.alerts_sync_severity_to_sev();
  END IF;
END $$;
