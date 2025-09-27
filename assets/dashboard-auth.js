// Dashboard auth guard: verifies local backend session before allowing access.
(async function dashboardAuthGuard() {
  if(!window.API || !window.API.auth){
    // Wait a tick if scripts load out-of-order
    await new Promise(r=> setTimeout(r, 50));
  }
  const redirectToLogin = () => {
    window.location.replace('auth.html?mode=login');
  };

  let ready = false;

  try {
    const me = await window.API.auth.me();
    const user = me?.user;
    if (!user) { redirectToLogin(); return; }

    const role = (user.role || 'citizen').toLowerCase();
    const fullName = user.full_name || user.email || '';

    window.__APP_INITIAL_DATA__ = {
      role,
      profile: { full_name: fullName, role },
      user
    };

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('role') !== role) {
      currentUrl.searchParams.set('role', role);
      window.history.replaceState({}, '', currentUrl);
    }

    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
      roleSelect.value = role;
      roleSelect.disabled = true;
      roleSelect.title = 'Role is assigned by the administrator';
    }

    const nameEl = document.querySelector('.profile-name');
    if (nameEl && fullName) {
      nameEl.textContent = fullName;
    }

    const logoutBtn = document.getElementById('logout-btn');
    const logoutBtnTop = document.getElementById('logout-btn-top');
    const onLogout = async () => { try { await window.API.auth.logout(); } catch {} redirectToLogin(); };
    if (logoutBtn) logoutBtn.addEventListener('click', onLogout);
    if (logoutBtnTop) logoutBtnTop.addEventListener('click', onLogout);

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
