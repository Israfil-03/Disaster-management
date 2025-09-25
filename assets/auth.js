// Production-ready auth flow with Supabase
(function () {
  const alertBox = document.getElementById('auth-alert');
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error('Supabase client not configured. Check assets/config.js.');
    if (alertBox) {
      alertBox.textContent = 'Supabase configuration missing. Update assets/config.js with your project URL and anon key.';
      alertBox.classList.remove('hidden');
    }
    document.querySelector('.auth-card')?.classList.remove('js-init-hide');
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const loginTab = $('#tab-login');
  const signupTab = $('#tab-signup');
  const loginPanel = $('#panel-login');
  const signupPanel = $('#panel-signup');
  const signupRole = /** @type {HTMLSelectElement|null} */ (document.getElementById('signup-role'));
  const roleDomainRules = window.authRoleDomains || {};
  const roleDashboardRoutes = window.roleDashboardRoutes || {};
  const ROLE_LABELS = {
    citizen: 'Citizen',
    authority: 'Government Authority',
    ngo: 'NGO',
    ndrf: 'NDRF'
  };

  function extractDomain(email) {
    return (email.split('@')[1] || '').toLowerCase();
  }

  function domainMatchesRule(domain, rule) {
    const normalizedRule = rule.toLowerCase();
    return domain === normalizedRule || domain.endsWith(`.${normalizedRule}`);
  }

  function isDomainAllowedForRole(role, email) {
    const domain = extractDomain(email);
    if (!domain) return false;
    const allowed = roleDomainRules[role] || [];
    if (Array.isArray(allowed) && allowed.length > 0) {
      return allowed.some((rule) => domainMatchesRule(domain, rule));
    }
    // Roles without explicit lists (e.g., citizen) can use any domain EXCEPT those reserved for other roles.
    for (const [otherRole, list] of Object.entries(roleDomainRules)) {
      if (otherRole === role || !Array.isArray(list) || list.length === 0) continue;
      if (list.some((rule) => domainMatchesRule(domain, rule))) {
        return false;
      }
    }
    return true;
  }

  function describeAllowedDomains(role) {
    const allowed = roleDomainRules[role] || [];
    if (Array.isArray(allowed) && allowed.length > 0) {
      return allowed.join(', ');
    }
    const reserved = Object.entries(roleDomainRules)
      .filter(([otherRole, list]) => otherRole !== role && Array.isArray(list) && list.length > 0)
      .flatMap(([, list]) => list);
    if (reserved.length > 0) {
      return `any domain except: ${reserved.join(', ')}`;
    }
    return 'any domain';
  }

  function inferRoleFromEmail(email) {
    const domain = extractDomain(email);
    // Prefer explicit roles with allowed lists
    for (const [role, list] of Object.entries(roleDomainRules)) {
      if (Array.isArray(list) && list.length > 0) {
        if (list.some((rule) => domainMatchesRule(domain, rule))) return role;
      }
    }
    return 'citizen';
  }

  function showAlert(message, variant = 'error') {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.classList.remove('hidden', 'success', 'info');
    if (variant === 'success') {
      alertBox.classList.add('success');
    } else if (variant === 'info') {
      alertBox.classList.add('info');
    }
  }

  function clearAlert() {
    if (!alertBox) return;
    alertBox.textContent = '';
    alertBox.classList.add('hidden');
    alertBox.classList.remove('success', 'info');
  }

  function setMode(mode) {
    const m = (mode || '').toString().toLowerCase();
    const isSignup = m === 'signup';
    loginTab?.setAttribute('aria-selected', String(!isSignup));
    signupTab?.setAttribute('aria-selected', String(isSignup));
    loginPanel?.classList.toggle('hidden', isSignup);
    signupPanel?.classList.toggle('hidden', !isSignup);
    clearAlert();
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

  function setSubmitting(button, isLoading, idleLabel, loadingLabel) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingLabel : idleLabel;
  }

  async function redirectIfAuthenticated() {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const session = data.session;
        let finalRole = 'citizen';
        try {
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
          if (prof?.role) finalRole = String(prof.role).toLowerCase();
        } catch {}
        if (!finalRole || finalRole === 'citizen') {
          finalRole = (session.user?.user_metadata?.role || '').toLowerCase() || inferRoleFromEmail(session.user?.email || '') || 'citizen';
        }
        const baseNext = roleDashboardRoutes[finalRole] || 'AadhyaPath_dashboard.html';
        const current = new URL(window.location.href);
        const next = new URL(baseNext, window.location.href);
        if (current.searchParams.get('demo') === '1') next.searchParams.set('demo','1');
        window.location.replace(next.toString());
      }
    } catch (err) {
      console.warn('Failed to read session', err);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearAlert();
    const email = /** @type {HTMLInputElement} */ (document.getElementById('login-email'))?.value.trim();
    const password = /** @type {HTMLInputElement} */ (document.getElementById('login-password'))?.value ?? '';
    if (!email || !password) {
      showAlert('Please provide both email and password.');
      return;
    }
    const submitBtn = /** @type {HTMLButtonElement|null} */ (loginPanel?.querySelector('button[type="submit"]') ?? null);
    setSubmitting(submitBtn, true, 'Log In', 'Signing in…');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = error.message || '';
        if (/email/i.test(message) && /confirm/i.test(message)) {
          showAlert('Your email address is not verified yet. Open the confirmation link sent by Supabase or disable email confirmation in your project settings.', 'info');
        } else {
          showAlert(message || 'Unable to sign in.');
        }
        return;
      }

      const user = data?.user;
      const inferred = inferRoleFromEmail(email);
      // 1) Prefer profile role if present
      let finalRole = 'citizen';
      try {
        const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
        if (prof?.role) finalRole = String(prof.role).toLowerCase();
      } catch {}
      // 2) Fallback: use metadata role, then inferred by domain
      if (!finalRole || finalRole === 'citizen') {
        finalRole = (user?.user_metadata?.role || '').toLowerCase() || inferred || 'citizen';
      }
      // 3) Enforce domain rules; coerce to the best allowed role
      if (!isDomainAllowedForRole(finalRole, email)) {
        if (isDomainAllowedForRole('authority', email)) finalRole = 'authority';
        else if (isDomainAllowedForRole('ndrf', email)) finalRole = 'ndrf';
        else finalRole = 'citizen';
      }

      // Sync metadata and ensure profile row exists
      try { await supabase.auth.updateUser({ data: { role: finalRole } }); } catch {}
      try {
        const fullName = (user?.user_metadata?.full_name || '').trim() || email;
        await supabase.from('profiles').upsert({ id: user.id, full_name: fullName, role: finalRole }, { onConflict: 'id' });
      } catch (e) { console.warn('Profile upsert on login failed', e); }

      // Build next URL and preserve demo flag from current URL if present
      {
        const current = new URL(window.location.href);
        const baseNext = roleDashboardRoutes[finalRole] || 'AadhyaPath_dashboard.html';
        const next = new URL(baseNext, window.location.href);
        if (current.searchParams.get('demo') === '1') {
          next.searchParams.set('demo', '1');
        }
        const nextUrl = next.toString();
        showAlert('Login successful. Redirecting…', 'success');
        window.location.replace(nextUrl);
        return;
      }
    } catch (err) {
      console.error(err);
      showAlert('Unexpected error while signing in. Please try again.');
    } finally {
      setSubmitting(submitBtn, false, 'Log In', 'Signing in…');
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    clearAlert();
    const name = /** @type {HTMLInputElement} */ (document.getElementById('signup-name'))?.value.trim();
    const email = /** @type {HTMLInputElement} */ (document.getElementById('signup-email'))?.value.trim();
    const password = /** @type {HTMLInputElement} */ (document.getElementById('signup-password'))?.value ?? '';
    const confirm = /** @type {HTMLInputElement} */ (document.getElementById('signup-confirm'))?.value ?? '';
    const role = signupRole?.value ?? 'citizen';

    if (!name || !email || !password || !confirm) {
      showAlert('Please fill in all the required fields.');
      return;
    }
    if (password !== confirm) {
      showAlert('Passwords do not match.');
      return;
    }
    if (!isDomainAllowedForRole(role, email)) {
      const roleLabel = ROLE_LABELS[role] || role;
      const description = describeAllowedDomains(role);
      showAlert(`${roleLabel} accounts must use: ${description}.`);
      return;
    }

    const submitBtn = /** @type {HTMLButtonElement|null} */ (signupPanel?.querySelector('button[type="submit"]') ?? null);
    setSubmitting(submitBtn, true, 'Create account', 'Creating…');

    try {
      const redirectUrl = (()=>{
        const u = new URL('auth.html?mode=login', window.location.href);
        // Keep demo flag if present during signup flow
        try { if (new URL(window.location.href).searchParams.get('demo') === '1') u.searchParams.set('demo','1'); } catch {}
        return u.toString();
      })();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, role },
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        showAlert(error.message || 'Unable to create account.');
        return;
      }

      const userId = data?.user?.id || null;
      if (userId) {
        // Ensure a profile row exists for RLS-dependent features
        try {
          await supabase.from('profiles').upsert({ id: userId, full_name: name, role }, { onConflict: 'id' });
        } catch (e) { console.warn('Profile upsert on signup failed', e); }
      }

      if (data?.session) {
        const current = new URL(window.location.href);
        const baseNext = roleDashboardRoutes[role] || 'AadhyaPath_dashboard.html';
        const next = new URL(baseNext, window.location.href);
        if (current.searchParams.get('demo') === '1') {
          next.searchParams.set('demo', '1');
        }
        showAlert('Account created. Redirecting…', 'success');
        window.location.replace(next.toString());
      } else {
        showAlert('Account created. Please verify your email inbox before logging in.', 'success');
        setMode('login');
      }
    } catch (err) {
      console.error(err);
      showAlert('Unexpected error while creating your account. Please try again.');
    } finally {
      setSubmitting(submitBtn, false, 'Create account', 'Creating…');
    }
  }

  // Initialize from URL
  const params = new URLSearchParams(window.location.search);
  const initialMode = (params.get('mode') || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';
  setMode(initialMode);
  // Reveal UI after initial mode is applied to prevent flicker
  document.querySelector('.auth-card')?.classList.remove('js-init-hide');

  // Tab clicks
  loginTab?.addEventListener('click', () => setMode('login'));
  signupTab?.addEventListener('click', () => setMode('signup'));
  $('#link-to-signup')?.addEventListener('click', (e) => { e.preventDefault(); setMode('signup'); });
  $('#link-to-login')?.addEventListener('click', (e) => { e.preventDefault(); setMode('login'); });

  loginPanel?.addEventListener('submit', handleLogin);
  signupPanel?.addEventListener('submit', handleSignup);

  // Redirect any existing session away from the auth screen
  redirectIfAuthenticated();

  // Keep listening for auth state changes (e.g., email magic link in same tab)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      try {
        const current = new URL(window.location.href);
        const user = session.user;
        let finalRole = (user?.user_metadata?.role || '').toLowerCase() || inferRoleFromEmail(user?.email || '') || 'citizen';
        const baseNext = roleDashboardRoutes[finalRole] || 'AadhyaPath_dashboard.html';
        const next = new URL(baseNext, window.location.href);
        if (current.searchParams.get('demo') === '1') next.searchParams.set('demo','1');
        window.location.replace(next.toString());
      } catch {
        window.location.replace('AadhyaPath_dashboard.html');
      }
    }
  });
})();
