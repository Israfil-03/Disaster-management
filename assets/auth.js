// Basic client-side auth flow for demo purposes only
(function () {
  const $ = (sel) => document.querySelector(sel);
  const loginTab = $('#tab-login');
  const signupTab = $('#tab-signup');
  const loginPanel = $('#panel-login');
  const signupPanel = $('#panel-signup');

  function setMode(mode) {
    const isSignup = mode === 'signup';
    loginTab.setAttribute('aria-selected', String(!isSignup));
    signupTab.setAttribute('aria-selected', String(isSignup));
    loginPanel.classList.toggle('hidden', isSignup);
    signupPanel.classList.toggle('hidden', !isSignup);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', isSignup ? 'signup' : 'login');
    window.history.replaceState({}, '', url);
  }

  // Initialize from URL
  const params = new URLSearchParams(window.location.search);
  setMode(params.get('mode') === 'signup' ? 'signup' : 'login');

  // Tab clicks
  loginTab.addEventListener('click', () => setMode('login'));
  signupTab.addEventListener('click', () => setMode('signup'));
  $('#link-to-signup')?.addEventListener('click', (e) => { e.preventDefault(); setMode('signup'); });
  $('#link-to-login')?.addEventListener('click', (e) => { e.preventDefault(); setMode('login'); });

  // Mock validation and redirect to dashboard
  loginPanel.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
    const pwd = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
    if (!email || !pwd) return;
    // TODO: integrate real auth later
    localStorage.setItem('dm_logged_in', '1');
    window.location.href = 'index.html';
  });

  signupPanel.addEventListener('submit', (e) => {
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
    // TODO: integrate real signup later
    localStorage.setItem('dm_logged_in', '1');
    window.location.href = 'index.html';
  });
})();
