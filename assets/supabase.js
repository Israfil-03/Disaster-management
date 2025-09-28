// Supabase initialization and helper APIs (browser ESM via CDN)
// Uses public anon/publishable key on the client; service role key must NEVER be exposed here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function readMeta(name) {
  try {
    const tag = document.querySelector(`meta[name="${name}"]`);
    const value = tag?.content?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function readWindow(keys = []) {
  if (typeof window === 'undefined') return undefined;
  for (const key of keys) {
    const value = window[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function resolveSupabaseSetting({ windowKeys = [], metaNames = [] }, fallback = '') {
  const fromWindow = readWindow(windowKeys);
  if (fromWindow) return fromWindow;

  for (const name of metaNames) {
    const value = readMeta(name);
    if (value) return value;
  }

  // In Vite/Parcel builds import.meta.env will exist; guard for static usage
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    for (const key of windowKeys) {
      const envValue = import.meta.env[key] || import.meta.env[`VITE_${key}`];
      if (typeof envValue === 'string' && envValue.trim()) {
        return envValue.trim();
      }
    }
  }

  return fallback;
}

const defaultSupabaseUrl = 'https://itniteawqzjuympwxorv.supabase.co';
const defaultSupabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0bml0ZWF3cXpqdXltcHd4b3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIwMzAsImV4cCI6MjA3NDM0ODAzMH0.k9HsSPabFeecC3LNpti4gBcMCC7FWasj2UcKQkBORxk';

const SUPABASE_URL = resolveSupabaseSetting({
  windowKeys: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL', '__SUPABASE_URL__'],
  metaNames: ['supabase-url', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'],
}, defaultSupabaseUrl);

const SUPABASE_ANON_KEY = resolveSupabaseSetting({
  windowKeys: ['SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY', 'EXPO_PUBLIC_SUPABASE_KEY', '__SUPABASE_KEY__'],
  metaNames: ['supabase-key', 'supabase-anon-key', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY', 'EXPO_PUBLIC_SUPABASE_KEY'],
}, defaultSupabaseKey);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Missing URL or publishable key. Provide via <meta name="supabase-url"> / <meta name="supabase-key"> or window globals.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: {
    params: { 
      eventsPerSecond: 10,
      heartbeatIntervalMs: 30000,
      reconnectAfterMs: function (tries) { return Math.min(tries * 1000, 30000); }
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'disaster-management-app'
    }
  }
});

// Firestore-like tiny shims so existing code can call similar APIs while we migrate
export const app = {}; // placeholder to satisfy imports
export const auth = {}; // placeholder; we use supabase.auth internally
export const db = {}; // placeholder for collection() signature compatibility

// Auth helpers (Firebase-like names)
export async function initAuthPersistence() {
  // Supabase JS v2 persists session by default; no-op for compatibility
}

export function onAuthStateChanged(_auth, callback) {
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => { try { sub.subscription.unsubscribe(); } catch {} };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function updateProfile(user, { displayName }) {
  // Store display name in user metadata and mirror to profiles table if present
  try { await supabase.auth.updateUser({ data: { full_name: displayName || '' } }); } catch {}
  try { if (user?.id) await ensureUserProfile(user, undefined, displayName); } catch {}
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Firestore-like data helpers used in app.js
export function serverTimestamp() {
  // Use client time; you can also set a DB default of now() on the column
  return new Date().toISOString();
}

// Minimal collection/doc shims so existing calls like collection(db,'chat') keep working
export function collection(_db, tableName) { return String(tableName); }
export function doc(_db, tableName, id) { return { __table: String(tableName), id }; }

export async function addDoc(tableRef, values) {
  const table = String(tableRef);
  const payload = Array.isArray(values) ? values : [values];
  const user = (await supabase.auth.getUser()).data?.user;
  
  // Add timestamp if not present
  const timestampedPayload = payload.map(item => {
    const enriched = {
      ...item,
      ts: item.ts || new Date().toISOString(),
    };

    const needsCreatedBy = ['alerts', 'reports'].includes(table);
    if (needsCreatedBy && user?.id && typeof enriched.created_by === 'undefined') {
      enriched.created_by = user.id;
    }

    if (table === 'alerts') {
      const messageText = enriched.msg ?? enriched.message ?? '';
      const severityLevel = enriched.sev ?? enriched.severity ?? 'Low';
      enriched.msg = messageText;
      enriched.message = messageText;
      enriched.sev = severityLevel;
      enriched.severity = severityLevel;
    }

    if (table === 'reports') {
      const descriptionText = enriched.desc ?? enriched.description ?? enriched.text ?? '';
      const locationText = enriched.loc ?? enriched.location ?? '';
      enriched.desc = descriptionText;
      enriched.description = descriptionText;
      enriched.loc = locationText;
      enriched.location = locationText;
      enriched.status = enriched.status || 'Pending';
    }

    if (table === 'chat') {
      const messageText = enriched.message ?? enriched.text ?? enriched.body ?? '';
      enriched.message = messageText;
      enriched.text = messageText;
    }

    return enriched;
  });
  
  try {
    const { data, error } = await supabase.from(table).insert(timestampedPayload).select();
    if (error) {
      console.error(`Error inserting into ${table}:`, error);
      throw error;
    }
    return data?.[0] || null;
  } catch (err) {
    console.error(`Failed to insert into ${table}:`, err);
    throw err;
  }
}

// Universal insert for alerts - works with any schema configuration
export async function insertAlert(alert) {
  const messageText = alert.msg ?? alert.message ?? alert.text ?? '';
  const severityLevel = alert.sev ?? alert.severity ?? 'Low';
  const user = (await supabase.auth.getUser()).data?.user;
  const createdBy = user?.id || null;
  
  const payload = {
    hazard: alert.hazard || 'Alert',
    sev: severityLevel,
    msg: messageText,
    message: messageText,
    severity: severityLevel,
    state: alert.state || '',
    district: alert.district || '',
    area: alert.area || '',
    lat: alert.lat || null,
    lng: alert.lng || null,
    ts: new Date().toISOString(),
    created_by: createdBy
  };

  try {
    const { data, error } = await supabase.from('alerts').insert([payload]).select();
    if (error) {
      console.error('Alert insertion error:', error);
      throw error;
    }
    return data?.[0] || null;
  } catch (error) {
    console.error('❌ Failed to insert alert:', error);
    throw error;
  }
}

// Universal insert for reports - handles all fields and reserved keywords
export async function insertReport(report) {
  const descriptionText = report.desc || report.description || report.text || '';
  const locationText = report.loc || report.location || '';
  const user = (await supabase.auth.getUser()).data?.user;
  const createdBy = user?.id || null;
  
  const payload = {
    type: report.type || 'Report',
    desc: descriptionText,  // Using desc (quoted in schema)
    description: descriptionText,  // Also populate description for compatibility
    loc: locationText,
    location: locationText,  // Also populate location for compatibility
    contact: report.contact || '',
    status: report.status || 'Pending',
    ts: new Date().toISOString(),
    created_by: createdBy
  };

  try {
    const { data, error } = await supabase.from('reports').insert([payload]).select();
    if (error) {
      console.error('Report insertion error:', error);
      throw error;
    }
    return data?.[0] || null;
  } catch (error) {
    console.error('❌ Failed to insert report:', error);
    throw error;
  }
}

export async function updateDoc(docRef, values) {
  const { __table: table, id } = docRef || {};
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDoc(docRef) {
  const { __table: table, id } = docRef || {};
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// Convenience queries
export async function fetchLatest(table, { limit = 100, order = 'ts', ascending = false } = {}) {
  let q = supabase.from(table).select('*');
  if (order) q = q.order(order, { ascending });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Realtime subscription helper with better error handling
export function subscribeTable(table, handler) {
  const channel = supabase
    .channel(`realtime:${table}:${Date.now()}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table 
    }, (payload) => {
      try { 
        handler(payload); 
      } catch (error) {
        console.error(`Error handling real-time event for ${table}:`, error);
      }
    })
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Real-time channel error for ${table}:`, err);
      }
    });
    
  return () => { 
    try { 
      supabase.removeChannel(channel); 
    } catch (error) {
      console.error(`Error unsubscribing from ${table}:`, error);
    } 
  };
}

// Upsert a user profile with role info into profiles (if table exists)
export async function ensureUserProfile(user, role = 'citizen', displayName) {
  try {
    if (!user?.id) return;
    const profile = {
      id: user.id,
      email: user.email || '',
      display_name: displayName || user.user_metadata?.full_name || '',
      role: role || 'citizen',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
    if (error && !/relation "profiles" does not exist/i.test(error.message)) {
      // Only surface errors other than missing table (in case DB not set up yet)
      console.error('ensureUserProfile failed:', error.message);
    }
  } catch (e) {
    // swallow to avoid breaking UX
  }
}

// Named exports for convenience in app.js
export { createClient };
