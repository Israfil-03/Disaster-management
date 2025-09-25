// Supabase client configuration for the AadhyaPath web app.
// Replace the placeholder values with your actual Supabase project URL and anon key.
// It's safe to expose the anon key in public clients; keep the service role key secret.
(function configureSupabaseClient() {
  if (!window.supabase) {
    console.error('Supabase library not loaded. Ensure the CDN script is included before assets/config.js.');
    return;
  }

  const SUPABASE_URL = 'https://itniteawqzjuympwxorv.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0bml0ZWF3cXpqdXltcHd4b3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIwMzAsImV4cCI6MjA3NDM0ODAzMH0.k9HsSPabFeecC3LNpti4gBcMCC7FWasj2UcKQkBORxk';

  const hasPlaceholders = !SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT-REF') ||
    !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR_PUBLIC_ANON_KEY');

  if (hasPlaceholders) {
    console.error('Supabase credentials are still placeholders. Update assets/config.js before deploying.');
    window.supabaseClient = null;
    return;
  }

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Restrict signup domains per role. Customize as needed.
  window.authRoleDomains = window.authRoleDomains || {
    citizen: [], // no restriction
    authority: ['gov.in', 'nic.in'],
    ngo: ['ngo.org'],
    ndrf: ['ndrf.gov.in']
  };

  // Customize dashboard redirect routes per role if you create dedicated pages.
  window.roleDashboardRoutes = window.roleDashboardRoutes || {
    citizen: 'AadhyaPath_dashboard.html?role=citizen',
    authority: 'AadhyaPath_dashboard.html?role=authority',
    ngo: 'AadhyaPath_dashboard.html?role=ngo',
    ndrf: 'AadhyaPath_dashboard.html?role=ndrf'
  };
})();
