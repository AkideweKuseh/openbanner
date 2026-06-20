/* ═══════════════════════════════════════════════════════════
   OpenBanner — Auth Gate (front-end mock session)
   ═══════════════════════════════════════════════════════════
   No user-account backend exists yet. This module provides a
   lightweight client-side session so the app can present a login
   flow. Replace login()/getUser() with a real API call when a
   backend is available.
   ═══════════════════════════════════════════════════════════ */

const SESSION_KEY = 'ob_session';

export function isAuthenticated() {
  try {
    return !!localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Mock login — accepts any non-empty email + password (≥ 4 chars). */
export function login(email, password) {
  const e = (email || '').trim();
  const p = (password || '').trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (p.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' };
  }
  const session = { email: e, name: e.split('@')[0], ts: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, user: session };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}
