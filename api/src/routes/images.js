import { Router } from 'express';
import express from 'express';
import { config } from '../config.js';
import { requireApiKey } from '../auth.js';
import { isStorageEnabled, putImage, getImage } from '../storage.js';

export const imagesRouter = Router();

// Allow-list of raster image types. SVG (and other XML/script-capable types) are
// excluded on purpose: this endpoint serves uploads PUBLICLY, and a browser navigating
// to an inline SVG would execute its embedded script in our API origin (stored XSS).
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const normalizeType = (ct) => (ct || '').split(';')[0].trim().toLowerCase();

// Accept only raw image bodies, capped at the same limit as JSON bodies.
const rawImage = express.raw({ type: 'image/*', limit: config.bodyLimit });

// POST /v1/images — upload a source image (authenticated). Body is the raw image
// bytes with an `image/*` Content-Type. Returns the opaque reference to store in a
// template element's `src`, plus a public URL for previewing it in the designer.
imagesRouter.post('/', requireApiKey, rawImage, async (req, res) => {
  if (!isStorageEnabled()) {
    return res.status(503).json({ error: 'image storage is not configured' });
  }
  const contentType = normalizeType(req.get('content-type'));
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return res.status(415).json({ error: 'unsupported image type (allowed: png, jpeg, webp, gif)' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.byteLength === 0) {
    return res.status(400).json({ error: 'empty image body' });
  }
  try {
    const key = await putImage(req.body, contentType);
    return res.status(201).json({ key, ref: `ob-image:${key}`, url: `/v1/images/${key}` });
  } catch (err) {
    req.log?.error({ err }, 'image upload failed');
    return res.status(err.status || 500).json({ error: err.expose ? err.message : 'upload failed' });
  }
});

// GET /v1/images/:key — PUBLIC (no API key) so the designer's <img> tags can load
// uploads directly. Keys are unguessable; MinIO is never exposed to the internet.
imagesRouter.get('/:key', async (req, res) => {
  if (!isStorageEnabled()) return res.status(503).json({ error: 'image storage is not configured' });
  try {
    const { buffer, contentType } = await getImage(req.params.key);
    // Serve a canonical raster type only — never echo a stored type that could be
    // script-capable (defense in depth; uploads are already allow-listed to raster).
    const safeType = ALLOWED_IMAGE_TYPES.has(normalizeType(contentType))
      ? normalizeType(contentType) : 'application/octet-stream';
    res.set('Content-Type', safeType);
    res.set('X-Content-Type-Options', 'nosniff');
    // Lock down direct navigation: even if a non-image slipped through, it can't script.
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    // Public image proxy: allow embedding from any origin (the designer UI is served
    // from a different origin than the API in prod, and localhost vs 127.0.0.1 in dev).
    // Overrides helmet's default Cross-Origin-Resource-Policy: same-origin for this route.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.expose ? err.message : 'fetch failed' });
  }
});
