import { config } from './config.js';

// Env-gated CORS. Only emits headers when CORS_ALLOWED_ORIGINS is configured
// (production leaves it unset => no CORS => locked down). Echoes the request Origin
// when it is allowed (works with or without credentials). Handles OPTIONS preflight
// before the API-key gate so preflight (which carries no key) isn't rejected as 401.

const allowed = new Set(config.corsAllowedOrigins);
const allowAll = allowed.has('*');

function isAllowed(origin) {
  if (!origin) return false;
  return allowAll || allowed.has(origin.toLowerCase());
}

export function corsMiddleware(req, res, next) {
  const origin = req.get('origin');
  if (isAllowed(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.set('Access-Control-Max-Age', '86400');
  }
  // Answer preflight immediately (before auth) so cross-origin browsers can proceed.
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}
