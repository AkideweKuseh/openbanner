import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/** Express middleware: reject requests without a valid X-API-Key. */
export function requireApiKey(req, res, next) {
  if (!checkApiKey(req.get('x-api-key') || '', config.apiToken)) {
    return res.status(401).json({ error: 'invalid or missing API key' });
  }
  next();
}

export function checkApiKey(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Compare against itself to keep timing roughly constant, then fail.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
