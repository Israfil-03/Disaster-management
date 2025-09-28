-- Fix RLS policies for better real-time functionality
-- Delete restrictive policies and create permissive ones for authenticated users

-- Alerts policies - allow all authenticated users to read/write
DO $$ BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "alerts_read" ON public.alerts;
  DROP POLICY IF EXISTS "alerts_insert" ON public.alerts;
  DROP POLICY IF EXISTS "alerts_update" ON public.alerts;
  DROP POLICY IF EXISTS "alerts_delete" ON public.alerts;
  
  -- Create permissive policies for all authenticated users
  CREATE POLICY "alerts_select_all" ON public.alerts 
    FOR SELECT USING (auth.role() = 'authenticated');
    
  CREATE POLICY "alerts_insert_all" ON public.alerts 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
  CREATE POLICY "alerts_update_all" ON public.alerts 
    FOR UPDATE USING (auth.role() = 'authenticated');
    
  CREATE POLICY "alerts_delete_all" ON public.alerts 
    FOR DELETE USING (auth.role() = 'authenticated');
END $$;

-- Reports policies - allow all authenticated users to read/write
DO $$ BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "reports_read" ON public.reports;
  DROP POLICY IF EXISTS "reports_insert" ON public.reports;
  DROP POLICY IF EXISTS "reports_update" ON public.reports;
  DROP POLICY IF EXISTS "reports_delete" ON public.reports;
  
  -- Create permissive policies for all authenticated users
  CREATE POLICY "reports_select_all" ON public.reports 
    FOR SELECT USING (auth.role() = 'authenticated');
    
  CREATE POLICY "reports_insert_all" ON public.reports 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
  CREATE POLICY "reports_update_all" ON public.reports 
    FOR UPDATE USING (auth.role() = 'authenticated');
    
  CREATE POLICY "reports_delete_all" ON public.reports 
    FOR DELETE USING (auth.role() = 'authenticated');
END $$;

-- Chat policies - allow all authenticated users to read/write
DO $$ BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "chat_read" ON public.chat;
  DROP POLICY IF EXISTS "chat_insert" ON public.chat;
  DROP POLICY IF EXISTS "chat_update" ON public.chat;
  DROP POLICY IF EXISTS "chat_delete" ON public.chat;
  
  -- Create permissive policies for all authenticated users
  CREATE POLICY "chat_select_all" ON public.chat 
    FOR SELECT USING (auth.role() = 'authenticated');
    
  CREATE POLICY "chat_insert_all" ON public.chat 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
  CREATE POLICY "chat_update_all" ON public.chat 
    FOR UPDATE USING (auth.role() = 'authenticated');
    
  CREATE POLICY "chat_delete_all" ON public.chat 
    FOR DELETE USING (auth.role() = 'authenticated');
END $$;

-- Profiles policies - allow users to read all but only update own
DO $$ BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "profiles_upsert_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
  
  -- Allow all authenticated users to read profiles
  CREATE POLICY "profiles_select_all" ON public.profiles 
    FOR SELECT USING (auth.role() = 'authenticated');
    
  -- Allow users to insert/update their own profile
  CREATE POLICY "profiles_upsert_own" ON public.profiles 
    FOR INSERT WITH CHECK (auth.uid() = id);
    
  CREATE POLICY "profiles_update_own" ON public.profiles 
    FOR UPDATE USING (auth.uid() = id);
END $$;

-- Ensure realtime is enabled for all tables
ALTER publication supabase_realtime ADD TABLE IF NOT EXISTS public.alerts;
ALTER publication supabase_realtime ADD TABLE IF NOT EXISTS public.reports;
ALTER publication supabase_realtime ADD TABLE IF NOT EXISTS public.chat;
ALTER publication supabase_realtime ADD TABLE IF NOT EXISTS public.profiles;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON public.alerts(ts DESC);
CREATE INDEX IF NOT EXISTS idx_reports_ts ON public.reports(ts DESC);
CREATE INDEX IF NOT EXISTS idx_chat_ts ON public.chat(ts ASC);
CREATE INDEX IF NOT EXISTS idx_alerts_state_district ON public.alerts(state, district);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);