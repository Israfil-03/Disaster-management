(function (global) {
  const API_BASE = global.API_BASE || '';

  // --- Core fetch helper ---
  async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', ...opts });
    let data = null;
    try { data = await res.clone().json(); } catch {}
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || 'Request failed';
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const client = {
    get: (p) => jsonFetch(`${API_BASE}/api${p}`),
    post: (p, body) => jsonFetch(`${API_BASE}/api${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }),
    patch: (p, body) => jsonFetch(`${API_BASE}/api${p}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    })
  };

  // --- Mock backend (fallback) ---
  let mockEnabled = false;
  const LS_USERS = 'dm_users_v1';
  const LS_CURRENT_USER = 'dm_current_user_v1';

  function lsGet(key, def = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
  function lsDel(key) { try { localStorage.removeItem(key); } catch {} }

  function usersAll() { return lsGet(LS_USERS, []); }
  function usersSave(list) { lsSet(LS_USERS, list); }
  function usersFindByEmail(email) { return usersAll().find(u => (u.email || '').toLowerCase() === (email || '').toLowerCase()); }

  const mockAuth = {
    async signup({ email, password, full_name, role }) {
      const exists = usersFindByEmail(email);
      if (exists) { const e = new Error('Account already exists'); e.status = 409; throw e; }
      const now = new Date().toISOString();
      const user = {
        id: Math.random().toString(36).slice(2),
        email,
        full_name: full_name || email,
        role: (role || 'citizen').toLowerCase(),
        created_at: now,
        // Mock-only: store plain password for local development (DO NOT use in production)
        __password: password
      };
      const list = usersAll(); list.push(user); usersSave(list);
      lsSet(LS_CURRENT_USER, user);
      const token = 'mock.' + Math.random().toString(36).slice(2);
      try { localStorage.setItem('auth_token', token); } catch {}
      return { user, token };
    },
    async login({ email, password }) {
      const u = usersFindByEmail(email);
      if (!u || u.__password !== password) { const e = new Error('Invalid credentials'); e.status = 401; throw e; }
      lsSet(LS_CURRENT_USER, u);
      const token = 'mock.' + Math.random().toString(36).slice(2);
      try { localStorage.setItem('auth_token', token); } catch {}
      return { user: u, token };
    },
    async me() {
      const u = lsGet(LS_CURRENT_USER, null);
      return { user: u };
    },
    async logout() {
      lsDel(LS_CURRENT_USER);
      try { localStorage.removeItem('auth_token'); } catch {}
      return { ok: true };
    }
  };

  async function tryNetworkThenMock(fnNet, fnMock) {
    if (mockEnabled) return fnMock();
    try { return await fnNet(); }
    catch (err) { mockEnabled = true; return fnMock(); }
  }

  const auth = {
    async signup({ email, password, full_name, role }) {
      return tryNetworkThenMock(
        () => client.post('/auth/signup', { email, password, full_name, role }).then((res) => { try { if (res && res.token) localStorage.setItem('auth_token', res.token); } catch {} return res; }),
        () => mockAuth.signup({ email, password, full_name, role })
      );
    },
    async login({ email, password }) {
      return tryNetworkThenMock(
        () => client.post('/auth/login', { email, password }).then((res) => { try { if (res && res.token) localStorage.setItem('auth_token', res.token); } catch {} return res; }),
        () => mockAuth.login({ email, password })
      );
    },
    async me() {
      return tryNetworkThenMock(
        () => client.get('/auth/me'),
        () => mockAuth.me()
      );
    },
    async logout() {
      // Always clear local token
      try { localStorage.removeItem('auth_token'); } catch {}
      return tryNetworkThenMock(
        () => client.post('/auth/logout', {}),
        () => mockAuth.logout()
      );
    },
    token() {
      try { return localStorage.getItem('auth_token'); } catch { return null; }
    }
  };

  const alerts = {
    list: () => client.get('/alerts'),
    create: (payload) => client.post('/alerts', payload)
  };

  const reports = {
    list: () => client.get('/reports'),
    create: (payload) => client.post('/reports', payload),
    update: (id, payload) => client.patch(`/reports/${id}`, payload)
  };

  const shelters = { list: () => client.get('/shelters') };

  async function getSocket(authToken) {
    if (!global.io) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${API_BASE}/socket.io/socket.io.js`;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const token = authToken || auth.token();
    return global.io(API_BASE || undefined, { auth: token ? { token } : {} });
  }

  global.API = { base: API_BASE, http: client, auth, alerts, reports, shelters, getSocket };
})(window);
