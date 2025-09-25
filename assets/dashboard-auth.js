// Dashboard auth guard: verifies Supabase session before allowing access.
(async function dashboardAuthGuard() {
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
