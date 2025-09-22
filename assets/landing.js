// Minimal JS for landing page
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

  // Allow buttons with data-mode to navigate to the correct auth mode
  document.querySelectorAll('[data-auth-mode]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = el.getAttribute('data-auth-mode') || 'login';
      window.location.href = `auth.html?mode=${encodeURIComponent(mode)}`;
    });
  });
})();
