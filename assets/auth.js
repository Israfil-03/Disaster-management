// Firebase-powered auth (login/signup) for the PWA
(function () {
  const $ = (sel) => document.querySelector(sel);
  const loginTab = $('#tab-login');
  const signupTab = $('#tab-signup');
  const loginPanel = $('#panel-login');
  const signupPanel = $('#panel-signup');

  // Determine role from email domain. Heuristics:
  // - ndrf.gov.in => ndrf
  // - *.gov.in, *.nic.in, *.gov => authority
  // - common public email providers => citizen
  // - *.org, *.ngo or domains containing 'ngo' => ngo
  // - default => citizen
  function determineRoleFromEmail(email) {
    try {
      const e = String(email || '').trim().toLowerCase();
      const domain = e.split('@')[1] || '';
      if (!domain) return 'citizen';
      if (domain === 'ndrf.gov.in' || /(^|\.)ndrf\.gov\.in$/.test(domain)) return 'ndrf';
      if (/\.gov\.in$/.test(domain) || /\.nic\.in$/.test(domain) || /\.gov$/.test(domain) || domain === 'gov.in') return 'authority';
      const publicMail = [
        'gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','msn.com','rediffmail.com','icloud.com','proton.me','protonmail.com','gmx.com','yandex.com','zoho.com'
      ];
      if (publicMail.includes(domain)) return 'citizen';
      if (/\.org$/.test(domain) || /\.ngo$/.test(domain) || /(^|\.)ngo(\.|$)/.test(domain)) return 'ngo';
      return 'citizen';
    } catch {
      return 'citizen';
    }
  }

  function persistSession({ uid, email, displayName }) {
    const role = determineRoleFromEmail(email);
    // Persist a small user snapshot and locked role
    try {
      localStorage.setItem('dm_logged_in', '1');
      localStorage.setItem('dm_role', role);
      localStorage.setItem('dm_role_locked', '1');
      localStorage.setItem('dm_user', JSON.stringify({
        uid, email, displayName: displayName || '', provider: 'firebase', role
      }));
      // Also sync legacy prefs without allowing user override of role
      try {
        const prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
        prefs.role = role;
        localStorage.setItem('prefs', JSON.stringify(prefs));
      } catch {}
    } catch {}
    return role;
  }

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
      const role = persistSession({ uid: user?.uid, email: user?.email, displayName: user?.displayName });
      // Redirect to the unified dashboard which will be role-locked by JS
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
      persistSession({ uid: user?.uid, email: user?.email, displayName: user?.displayName || name });
      // Redirect to the unified dashboard which will be role-locked by JS
      window.location.href = 'AadhyaPath_dashboard.html';
    } catch (err) {
      const msg = (err && err.message) || 'Sign up failed';
      alert(msg);
    }
  });
})();
