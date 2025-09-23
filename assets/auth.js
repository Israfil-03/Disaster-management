// Basic client-side auth flow for demo purposes only
(function () {
  const $ = (sel) => document.querySelector(sel);
  const loginTab = $('#tab-login');
  const signupTab = $('#tab-signup');
  const loginPanel = $('#panel-login');
  const signupPanel = $('#panel-signup');

  function setMode(mode) {
    const m = (mode || '').toString().toLowerCase();
    const isSignup = m === 'signup';
    loginTab.setAttribute('aria-selected', String(!isSignup));
    signupTab.setAttribute('aria-selected', String(isSignup));
    loginPanel.classList.toggle('hidden', isSignup);
    signupPanel.classList.toggle('hidden', !isSignup);
    // Update URL only if mode differs to avoid unnecessary history churn
    try {
      const url = new URL(window.location.href);
      const current = (url.searchParams.get('mode') || '').toLowerCase();
      const desired = isSignup ? 'signup' : 'login';
      if (current !== desired) {
        url.searchParams.set('mode', desired);
        window.history.replaceState({}, '', url);
      }
    } catch {}
  }

  // Initialize from URL
  const params = new URLSearchParams(window.location.search);
  const initialMode = (params.get('mode') || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';
  setMode(initialMode);
  // Reveal UI after initial mode is applied to prevent flicker
  document.querySelector('.auth-card')?.classList.remove('js-init-hide');

  // Tab clicks
  loginTab.addEventListener('click', () => setMode('login'));
  signupTab.addEventListener('click', () => setMode('signup'));
  $('#link-to-signup')?.addEventListener('click', (e) => { e.preventDefault(); setMode('signup'); });
  $('#link-to-login')?.addEventListener('click', (e) => { e.preventDefault(); setMode('login'); });

  // Real validation with backend and redirect to dashboard on success
  loginPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
    const pwd = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
    if (!email || !pwd) return;
    try {
      const base = (window.API_BASE || '').trim();
      const url = (base ? base : '') + '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pwd })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Login failed');
        return;
      }
      localStorage.setItem('dm_logged_in', '1');
      localStorage.setItem('dm_user', JSON.stringify(data.user || {}));
      window.location.href = 'AadhyaPath_dashboard.html';
    } catch (err) {
      alert('Network error while logging in. Ensure the server is running.');
    }
  });

  signupPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = /** @type {HTMLInputElement} */(document.getElementById('signup-name')).value.trim();
    const email = /** @type {HTMLInputElement} */(document.getElementById('signup-email')).value.trim();
    const pwd = /** @type {HTMLInputElement} */(document.getElementById('signup-password')).value;
    const confirm = /** @type {HTMLInputElement} */(document.getElementById('signup-confirm')).value;
    if (!name || !email || !pwd || !confirm) return;
    if (pwd !== confirm) {
      alert('Passwords do not match.');
      return;
    }
    try {
      const base = (window.API_BASE || '').trim();
      const url = (base ? base : '') + '/api/auth/signup';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: pwd })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Sign up failed');
        return;
      }
      localStorage.setItem('dm_logged_in', '1');
      localStorage.setItem('dm_user', JSON.stringify(data.user || {}));
      window.location.href = 'AadhyaPath_dashboard.html';
    } catch (err) {
      alert('Network error while signing up. Ensure the server is running.');
    }
  });
})();
