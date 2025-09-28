// Supabase initialization and helper APIs (browser ESM via CDN)
// Uses public anon key on the client; service role key must NEVER be exposed here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Project configuration (provided by user)
const SUPABASE_URL = 'https://itniteawqzjuympwxorv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0bml0ZWF3cXpqdXltcHd4b3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIwMzAsImV4cCI6MjA3NDM0ODAzMH0.k9HsSPabFeecC3LNpti4gBcMCC7FWasj2UcKQkBORxk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
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
  // For inserts we don't strictly need the returning row; skipping select avoids
  // schema cache mismatches when columns are added/renamed server-side.
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw error;
  // Return a lightweight stub so callers that ignore the return keep working
  const data = null;
  if (error) throw error;
  return data?.[0] || null;
}

// Smart insert for alerts: handle either 'msg' or 'message' column depending on DB schema
export async function insertAlert(alert) {
  // Build two payload variants
  const base = {
    hazard: alert.hazard || 'Alert',
    sev: alert.sev || 'Low',
    state: alert.state || '',
    district: alert.district || '',
    area: alert.area || '',
    lat: alert.lat,
    lng: alert.lng,
  };

  // Prefer 'msg' first (matches our canonical schema)
  const payloadMsg = [{ ...base, msg: alert.msg ?? alert.message ?? alert.text ?? '' }];
  try {
    // First try with canonical columns (sev + msg)
    const { error } = await supabase.from('alerts').insert(payloadMsg);
    if (error) throw error;
    return null;
  } catch (e) {
    // If the error indicates 'msg' column not found, retry with 'message'
    const msg = (e && e.message) ? String(e.message).toLowerCase() : '';
    const mentions = (s) => msg.includes(s);
    // Build a severity-compatible base if 'sev' appears problematic
    const baseSeverity = { ...base };
    delete baseSeverity.sev; // we'll re-add under the right key in each path

    if (mentions("'msg' column") || mentions('column msg') || (mentions('msg') && !mentions('sev'))) {
      // Try with message column (sev as-is)
      try {
        const { error } = await supabase.from('alerts').insert([{ ...base, message: alert.message ?? alert.msg ?? alert.text ?? '' }]);
        if (error) throw error;
        return null;
      } catch (e2) {
        // If sev is also an issue, fall through to severity compatibility below
        const m2 = (e2 && e2.message) ? String(e2.message).toLowerCase() : '';
        if (!(m2.includes("'sev' column") || m2.includes('column sev') || m2.includes('sev'))) throw e2;
      }
    }

    // If 'sev' is not recognized by the API/schema cache, retry using 'severity'
    if (mentions("'sev' column") || mentions('column sev') || mentions('sev')) {
      const payloadSeverityMsg = [{ ...baseSeverity, severity: alert.sev || 'Low', msg: alert.msg ?? alert.message ?? alert.text ?? '' }];
      try {
        const { error } = await supabase.from('alerts').insert(payloadSeverityMsg);
        if (error) throw error;
        return null;
      } catch (e3) {
        // Last attempt: severity + message
        const { error } = await supabase.from('alerts').insert([{ ...baseSeverity, severity: alert.sev || 'Low', message: alert.message ?? alert.msg ?? alert.text ?? '' }]);
        if (error) throw error;
        return null;
      }
    }
    throw e;
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

// Realtime subscription helper
export function subscribeTable(table, handler) {
  const channel = supabase
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      try { handler(payload); } catch {}
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // no-op
      }
    });
  return () => { try { supabase.removeChannel(channel); } catch {} };
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
      console.warn('ensureUserProfile failed:', error.message);
    }
  } catch (e) {
    // swallow to avoid breaking UX
  }
}

// Named exports for convenience in app.js
export { createClient };
