// Local app configuration (no Supabase). This file defines role domain rules and
// per-role dashboard routes. It's safe to include on any page.
(function configureLocalApp() {
  // Optional base URL for the local backend (leave empty for same-origin)
  window.API_BASE = window.API_BASE || '';

  // Restrict signup/login domains per role. Customize as needed.
  window.authRoleDomains = window.authRoleDomains || {
    citizen: [], // no restriction
    authority: ['gov.in', 'nic.in'],
    ngo: ['ngo.org'],
    ndrf: ['ndrf.gov.in']
  };

  // Dashboard redirect routes per role.
  window.roleDashboardRoutes = window.roleDashboardRoutes || {
    citizen: 'AadhyaPath_dashboard.html?role=citizen',
    authority: 'AadhyaPath_dashboard.html?role=authority',
    ngo: 'AadhyaPath_dashboard.html?role=ngo',
    ndrf: 'AadhyaPath_dashboard.html?role=ndrf'
  };
})();
