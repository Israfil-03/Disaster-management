(function () {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '';

  // 1) URL param ?api=https://backend.example.com (persist to localStorage)
  let apiFromUrl = '';
  try {
    const u = new URL(window.location.href);
    apiFromUrl = (u.searchParams.get('api') || '').trim();
    if (apiFromUrl) {
      try { localStorage.setItem('API_BASE', apiFromUrl); } catch {}
    }
  } catch {}

  // 2) localStorage override
  let apiFromStorage = '';
  try { apiFromStorage = (localStorage.getItem('API_BASE') || '').trim(); } catch {}

  // 3) Global variable override
  const apiFromGlobal = (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim()) ? window.__API_BASE__.trim() : '';

  // 4) Meta tag
  const meta = document.querySelector('meta[name="api-base"]');
  const apiFromMeta = (meta && meta.content ? meta.content.trim() : '') || '';

  // 5) Same-origin fallback for hosted deployments with colocated API
  let apiFromOrigin = '';
  if (!isLocal && location.protocol.startsWith('http')) {
    apiFromOrigin = `${location.protocol}//${location.host}`;
  }

  // 6) Local default (align with express server PORT)
  const apiDefault = isLocal ? 'http://localhost:5174' : '';

  const resolved = (apiFromUrl || apiFromStorage || apiFromGlobal || apiFromMeta || apiFromOrigin || apiDefault).replace(/\/$/, '');
  window.API_BASE = resolved;
  if (!resolved && !isLocal) {
    console.warn('API_BASE is not set. Set ?api= or <meta name="api-base" ...>');
  } else {
    console.info('API_BASE:', resolved);
  }
})();
