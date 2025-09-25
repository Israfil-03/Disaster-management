// Dashboard auth guard: verifies Supabase session before allowing access.
(async function dashboardAuthGuard() {
  // Local-only demo mode: enable with ?demo=1 on http://localhost or 127.0.0.1
  // This bypasses Supabase auth to let developers preview the dashboard UI.
  try {
    const url = new URL(window.location.href);
    const isDemo = url.searchParams.get('demo') === '1';
  const host = location.hostname;
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(host);
  const isPrivateLan = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
  const isLocal = isLocalHost || isPrivateLan;
    if (isDemo && isLocal) {
      window.__DEMO_MODE__ = true;
      const roleParam = (url.searchParams.get('role') || 'citizen').toLowerCase();
      const role = ['citizen','authority','ngo','ndrf'].includes(roleParam) ? roleParam : 'citizen';
      window.__APP_INITIAL_DATA__ = {
        role,
        profile: { full_name: 'Demo User', role },
        user: { id: '00000000-0000-0000-0000-000000000000', email: 'demo@example.com', user_metadata: { role, full_name: 'Demo User' } }
      };
      // Reflect role in URL for app.js conveniences
      if (url.searchParams.get('role') !== role) {
        url.searchParams.set('role', role);
        window.history.replaceState({}, '', url);
      }
      // Allow changing role via selector in demo mode
      const roleSelect = document.getElementById('role-select');
      if (roleSelect) {
        roleSelect.disabled = false;
        roleSelect.value = role;
      }
      // Reveal UI and exit guard early
      document.documentElement.classList.remove('auth-checking');
      return;
    }
  } catch {}

  const supabase = window.supabaseClient;
  const redirectToLogin = () => {
    window.location.replace('auth.html?mode=login');
  };

  if (!supabase) {
    console.error('Supabase client not configured.');
    redirectToLogin();
    return;
  }

  let ready = false;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data?.session;
    if (!session) {
      redirectToLogin();
      return;
    }

    let role = session.user?.user_metadata?.role || 'citizen';
    let fullName = session.user?.user_metadata?.full_name || session.user?.email || '';

    // Fetch profile row for richer info (requires policies allowing auth.uid())
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!profileError && profile) {
      role = (profile.role || role || 'citizen').toLowerCase();
      fullName = profile.full_name || fullName;
    }

    // Repair role if domain indicates a privileged role and profile/metadata disagree
    try {
      const email = (session.user?.email || '').toLowerCase();
      const domain = email.split('@')[1] || '';
      const domains = window.authRoleDomains || {};
      const matches = (list)=> Array.isArray(list) && list.some(r=> domain === r.toLowerCase() || domain.endsWith('.'+r.toLowerCase()));
      let inferred = 'citizen';
      if (matches(domains.ndrf)) inferred = 'ndrf';
      else if (matches(domains.authority)) inferred = 'authority';
      else if (matches(domains.ngo)) inferred = 'ngo';
      // If inferred is higher-privilege than current role, sync it
      const current = (role||'citizen').toLowerCase();
      const rank = { citizen:0, ngo:1, authority:2, ndrf:3 };
      if (rank[inferred] > rank[current]){
        role = inferred;
        // Update metadata and profile so RLS/UI reflect the correct role
        try { await supabase.auth.updateUser({ data: { role } }); } catch {}
        try { await supabase.from('profiles').upsert({ id: session.user.id, full_name: fullName, role }, { onConflict: 'id' }); } catch {}
      }
    } catch {}

    // If metadata role is missing or out-of-sync with profile, update metadata for consistency
    try {
      if ((session.user?.user_metadata?.role || '').toLowerCase() !== role) {
        await supabase.auth.updateUser({ data: { role } });
      }
    } catch {}

    const normalizedRole = (role || 'citizen').toLowerCase();
    window.__APP_INITIAL_DATA__ = {
      role: normalizedRole,
      profile: {
        full_name: fullName,
        role: normalizedRole
      },
      user: session.user
    };

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('role') !== normalizedRole) {
      currentUrl.searchParams.set('role', normalizedRole);
      window.history.replaceState({}, '', currentUrl);
    }

    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
      roleSelect.value = normalizedRole;
      roleSelect.disabled = true;
      roleSelect.title = 'Role is assigned by the administrator';
    }

    const nameEl = document.querySelector('.profile-name');
    if (nameEl && fullName) {
      nameEl.textContent = fullName;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        redirectToLogin();
      });
    }

    ready = true;
  } catch (err) {
    console.error('Dashboard auth guard failed', err);
    redirectToLogin();
    return;
  } finally {
    if (ready) {
      document.documentElement.classList.remove('auth-checking');
    }
  }
})();
