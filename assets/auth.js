// Local backend auth (replaces Supabase)
(function () {
  const alertBox = document.getElementById('auth-alert');

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
      const me = await window.API.auth.me();
      if (me?.user) {
        window.location.replace('AadhyaPath_dashboard.html');
      }
    } catch {}
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
      const res = await window.API.auth.login({ email, password });
      const user = res?.user || {};
      let role = (user.role || '').toLowerCase() || inferRoleFromEmail(email);
      if (!isDomainAllowedForRole(role, email)) {
        await window.API.auth.logout();
        const description = describeAllowedDomains(role);
        showAlert(`The email domain is not authorized for ${ROLE_LABELS[role] || role} accounts. Allowed domains: ${description}.`, 'info');
        return;
      }
      const nextUrl = (window.roleDashboardRoutes && window.roleDashboardRoutes[role]) || 'AadhyaPath_dashboard.html';
      showAlert('Login successful. Redirecting…', 'success');
      window.location.replace(nextUrl);
    } catch (err) {
      console.error(err);
      showAlert(err?.message || 'Unable to sign in.');
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
      const res = await window.API.auth.signup({ email, password, full_name: name, role });
      const nextUrl = (window.roleDashboardRoutes && window.roleDashboardRoutes[role]) || 'AadhyaPath_dashboard.html';
      showAlert('Account created. Redirecting…', 'success');
      window.location.replace(nextUrl);
    } catch (err) {
      console.error(err);
      const msg = err?.message || 'Unable to create account.';
      showAlert(msg);
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
})();
