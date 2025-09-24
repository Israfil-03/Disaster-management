// Firebase-powered auth (login/signup) for the PWA
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

  // Firebase Auth: login
  loginPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
    const pwd = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
    if (!email || !pwd) return;
    try {
  const mod = await import('./firebase.js');
      await mod.initAuthPersistence();
      const cred = await mod.signInWithEmailAndPassword(mod.auth, email, pwd);
      const user = cred?.user;
      // Persist a small user snapshot for dashboard usage
      localStorage.setItem('dm_logged_in', '1');
      localStorage.setItem('dm_user', JSON.stringify({
        uid: user?.uid,
        email: user?.email,
        displayName: user?.displayName || '',
        provider: 'firebase',
      }));
      window.location.href = 'AadhyaPath_dashboard.html';
    } catch (err) {
      const msg = (err && err.message) || 'Login failed';
      alert(msg);
    }
  });

  // Firebase Auth: sign up
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
  const mod = await import('./firebase.js');
      await mod.initAuthPersistence();
      const cred = await mod.createUserWithEmailAndPassword(mod.auth, email, pwd);
      if (name) {
        try {
          await mod.updateProfile(cred.user, { displayName: name });
        } catch (_) {}
      }
      const user = cred?.user;
      localStorage.setItem('dm_logged_in', '1');
      localStorage.setItem('dm_user', JSON.stringify({
        uid: user?.uid,
        email: user?.email,
        displayName: user?.displayName || name || '',
        provider: 'firebase',
      }));
      window.location.href = 'AadhyaPath_dashboard.html';
    } catch (err) {
      const msg = (err && err.message) || 'Sign up failed';
      alert(msg);
    }
  });
})();
