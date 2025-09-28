// Supabase-powered auth (login/signup) for the PWA
(function () {
  let hasNavigated = false;
  async function redirectToDashboard() {
    hasNavigated = true;
    // Give the browser a moment to flush localStorage and pending async work before navigating
    try { await new Promise(r => setTimeout(r, 150)); } catch {}
    const url = 'AadhyaPath_dashboard.html';
    try { window.location.href = url; } catch {}
    // Belt-and-suspenders: try assign shortly after in case the first call was ignored
    setTimeout(() => { try { if (!/AadhyaPath_dashboard\.html$/i.test(location.pathname)) { window.location.assign(url); } } catch {} }, 10);
  }
  const $ = (sel) => document.querySelector(sel);

  // Initialize UI (tabs, forms). We call this once the DOM is ready.
  function initUI() {
    const loginTab = $('#tab-login');
    const signupTab = $('#tab-signup');
    const loginPanel = $('#panel-login');
    const signupPanel = $('#panel-signup');

    if (!loginTab || !signupTab || !loginPanel || !signupPanel) {
      // If markup isn't present yet, try again on next tick
      return setTimeout(initUI, 0);
    }

    function setMode(mode) {
      const m = (mode || '').toString().toLowerCase();
      const isSignup = m === 'signup';
      try { loginTab.setAttribute('aria-selected', String(!isSignup)); } catch {}
      try { signupTab.setAttribute('aria-selected', String(isSignup)); } catch {}
      try { loginPanel.classList.toggle('hidden', isSignup); } catch {}
      try { signupPanel.classList.toggle('hidden', !isSignup); } catch {}
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

    // Supabase Auth: login
    loginPanel.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
      const pwd = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
      if (!email || !pwd) return;
      try {
        const btn = /** @type {HTMLButtonElement} */ (e.submitter || loginPanel.querySelector('button[type="submit"]'));
        btn && (btn.disabled = true);
        const mod = await import('./supabase.js');
        await mod.initAuthPersistence();
        const cred = await mod.signInWithEmailAndPassword(mod.auth, email, pwd);
        const user = cred?.user;
        const displayName = user?.user_metadata?.full_name || user?.displayName;
        const role = persistSession({ uid: user?.id, email: user?.email, displayName });
        // Upsert profile in Firestore
        try { await mod.ensureUserProfile(user, role); } catch {}
        // Redirect to the unified dashboard which will be role-locked by JS
        await redirectToDashboard();
      } catch (err) {
        const msg = (err && err.message) || 'Login failed';
        alert(msg);
        const btn = /** @type {HTMLButtonElement} */ (e.submitter || loginPanel.querySelector('button[type="submit"]'));
        btn && (btn.disabled = false);
      }
    });

    // Supabase Auth: sign up
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
        const btn = /** @type {HTMLButtonElement} */ (e.submitter || signupPanel.querySelector('button[type="submit"]'));
        btn && (btn.disabled = true);
        const mod = await import('./supabase.js');
        await mod.initAuthPersistence();
        const cred = await mod.createUserWithEmailAndPassword(mod.auth, email, pwd);
        if (name) {
          try {
            await mod.updateProfile(cred.user, { displayName: name });
          } catch (_) {}
        }
        const user = cred?.user;
        const displayName = user?.user_metadata?.full_name || name || user?.displayName;
        const role = persistSession({ uid: user?.id, email: user?.email, displayName });
        // Create initial profile in Firestore
        try { await mod.ensureUserProfile(user, role); } catch {}
        // Redirect to the unified dashboard which will be role-locked by JS
        await redirectToDashboard();
      } catch (err) {
        const msg = (err && err.message) || 'Sign up failed';
        alert(msg);
        const btn = /** @type {HTMLButtonElement} */ (e.submitter || signupPanel.querySelector('button[type="submit"]'));
        btn && (btn.disabled = false);
      }
    });

    // Extra reliability: if Supabase reports an authenticated user at any time on this page, navigate.
    (async ()=>{
      try{
        const mod = await import('./supabase.js');
        mod.onAuthStateChanged(mod.auth, async (user)=>{
          if(user && !hasNavigated){
            hasNavigated = true;
            // Ensure minimal session flags exist (in case login came from elsewhere)
            try{
              const snap = JSON.parse(localStorage.getItem('dm_user')||'{}');
              if(!snap || !snap.uid){
                const role = determineRoleFromEmail(user.email);
                localStorage.setItem('dm_logged_in','1');
                localStorage.setItem('dm_role', role);
                localStorage.setItem('dm_role_locked','1');
                localStorage.setItem('dm_user', JSON.stringify({ uid:user.id || user.uid, email:user.email, displayName:(user.user_metadata?.full_name||user.displayName||''), provider:'supabase', role }));
                try{ const prefs = JSON.parse(localStorage.getItem('prefs')||'{}'); prefs.role = role; localStorage.setItem('prefs', JSON.stringify(prefs)); }catch{}
              }
            }catch{}
            await redirectToDashboard();
          }
        });
      }catch{}
    })();
  }

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
  uid, email, displayName: displayName || '', provider: 'supabase', role
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

  // Defer UI init until DOM is ready, to avoid null refs before HTML parses
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
