// Supabase client configuration for the AadhyaPath web app.
// Replace the placeholder values with your actual Supabase project URL and anon key.
// It's safe to expose the anon key in public clients; keep the service role key secret.
(function configureSupabaseClient() {
  // Global role-domain and dashboard routes, available for both real and demo modes
  window.authRoleDomains = window.authRoleDomains || {
    citizen: [], // no restriction
    authority: ['gov.in', 'nic.in'],
    ngo: ['ngo.org'],
    ndrf: ['ndrf.gov.in']
  };
  window.roleDashboardRoutes = window.roleDashboardRoutes || {
    citizen: 'dashboard-citizen.html',
    authority: 'dashboard-authority.html',
    ngo: 'dashboard-ngo.html',
    ndrf: 'dashboard-ndrf.html'
  };

  // Demo mode provides a safe, local-only mock of Supabase authentication.
  // Enable by visiting any page with ?demo=1 appended to the URL.
  const isDemo = (() => {
    try { return new URL(window.location.href).searchParams.get('demo') === '1'; } catch { return false; }
  })();

  if (isDemo) {
    // Minimal in-memory mock for Supabase auth + a tiny profiles table
    const demoDb = {
      users: new Map(
        [
          ['citizen@example.com', { id: 'u_citizen', email: 'citizen@example.com', password: 'demo123', user_metadata: { full_name: 'Demo Citizen', role: 'citizen' } }],
          ['officer@gov.in', { id: 'u_officer', email: 'officer@gov.in', password: 'demo123', user_metadata: { full_name: 'Gov Officer', role: 'authority' } }],
          ['responder@ops.ndrf.gov.in', { id: 'u_ndrf', email: 'responder@ops.ndrf.gov.in', password: 'demo123', user_metadata: { full_name: 'NDRF Responder', role: 'ndrf' } }],
          ['volunteer@relief.ngo.org', { id: 'u_ngo', email: 'volunteer@relief.ngo.org', password: 'demo123', user_metadata: { full_name: 'NGO Volunteer', role: 'ngo' } }]
        ]
      ),
      profiles: new Map(),
      session: null
    };

    // Seed profiles
    for (const [, u] of demoDb.users.entries()) {
      demoDb.profiles.set(u.id, { id: u.id, full_name: u.user_metadata.full_name, role: u.user_metadata.role });
    }

    function mkResp(data, error = null) { return { data, error }; }
    function selectBuilder(table) {
      return {
        select() { return this; },
        eq(col, val) {
          this._col = col; this._val = val; return this;
        },
        async maybeSingle() {
          if (table === 'profiles' && this._col === 'id') {
            const row = demoDb.profiles.get(this._val) || null;
            return mkResp(row, null);
          }
          return mkResp(null, null);
        },
        async upsert(row /*, opts */) {
          if (table === 'profiles' && row && row.id) {
            const prior = demoDb.profiles.get(row.id) || {};
            const merged = { ...prior, ...row };
            demoDb.profiles.set(row.id, merged);
            return mkResp({ id: row.id }, null);
          }
          return mkResp(null, null);
        }
      };
    }

    const listeners = new Set();
    const mockAuth = {
      async getSession() {
        return mkResp({ session: demoDb.session });
      },
      async signInWithPassword({ email, password }) {
        const u = demoDb.users.get((email || '').toLowerCase());
        if (!u || u.password !== password) {
          return mkResp({ user: null, session: null }, { message: 'Invalid email or password.' });
        }
        demoDb.session = { user: { id: u.id, email: u.email, user_metadata: { ...u.user_metadata } } };
        for (const cb of listeners) try { cb('SIGNED_IN', demoDb.session); } catch {}
        return mkResp({ user: demoDb.session.user, session: demoDb.session });
      },
      async signUp({ email, password, options }) {
        const em = (email || '').toLowerCase();
        if (demoDb.users.has(em)) {
          return mkResp(null, { message: 'User already exists (demo).' });
        }
        const id = `u_${Math.random().toString(36).slice(2, 10)}`;
        const meta = { ...(options?.data || {}), role: (options?.data?.role || 'citizen').toLowerCase() };
        const user = { id, email: em, password, user_metadata: meta };
        demoDb.users.set(em, user);
        demoDb.profiles.set(id, { id, full_name: meta.full_name || em, role: meta.role });
        // For simplicity, keep email confirmation off in demo and auto sign in
        demoDb.session = { user: { id, email: em, user_metadata: { ...meta } } };
        for (const cb of listeners) try { cb('SIGNED_IN', demoDb.session); } catch {}
        return mkResp({ user: demoDb.session.user, session: demoDb.session });
      },
      async updateUser({ data }) {
        if (!demoDb.session?.user) return mkResp(null, { message: 'No session' });
        const u = demoDb.users.get(demoDb.session.user.email);
        if (u) { u.user_metadata = { ...u.user_metadata, ...(data || {}) }; demoDb.session.user.user_metadata = { ...u.user_metadata }; }
        return mkResp({ user: demoDb.session.user });
      },
      onAuthStateChange(cb) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      }
    };

    window.supabaseClient = {
      auth: mockAuth,
      from(table) { return selectBuilder(table); }
    };

    console.info('[Demo Mode] Using local mock Supabase client. No external calls will be made.');
    return; // Skip real Supabase initialization in demo mode
  }

  // Real Supabase client initialization (non-demo)
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
})();
