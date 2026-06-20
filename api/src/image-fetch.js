import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { httpError } from './util.js';
import { refToKey, getImage } from './storage.js';

function ip4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) + Number(oct)) >>> 0, 0);
}
function inCidr4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip4ToInt(ip) & mask) === (ip4ToInt(base) & mask);
}
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
];

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return V4_BLOCKS.some(([b, n]) => inCidr4(ip, b, n));
  if (net.isIPv6(ip)) {
    const lc = ip.toLowerCase();
    if (lc === '::1' || lc === '::') return true;
    const mapped = lc.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const head = parseInt(lc.split(':')[0] || '0', 16);
    if (head >= 0xfe80 && head <= 0xfebf) return true; // link-local
    if (head >= 0xfc00 && head <= 0xfdff) return true; // unique local
    if (head >= 0xff00) return true;                   // multicast
    return false;
  }
  return true; // unknown -> block
}

// Inline, base64-encoded image data URI (e.g. uploads from the designer via
// FileReader.readAsDataURL). Captures the image/* mime type and the payload.
const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Resolve an element's `src` to an inline data URI suitable for the renderer.
 * Already-inline `data:image/*;base64,...` sources (uploaded images) are
 * validated and passed through; remote http(s) sources go through the SSRF-
 * guarded fetch. Anything else is rejected.
 */
export async function resolveImageSrc(src) {
  const key = refToKey(src);
  if (key) return resolveStoredImage(key);
  if (src.startsWith('data:')) return resolveDataUri(src);
  return fetchImageAsDataUri(src);
}

// `ob-image:<key>` — an image uploaded to our own object storage. Fetched over the
// internal network with scoped credentials, so it bypasses the SSRF host allow-list.
async function resolveStoredImage(key) {
  const { buffer, contentType } = await getImage(key);
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function resolveDataUri(src) {
  const m = DATA_URI_RE.exec(src);
  if (!m) {
    throw httpError(400, 'invalid image data URI (only base64-encoded image/* is supported)');
  }
  // Decoded byte size of base64 ≈ 3/4 of the encoded length (minus padding).
  const padding = (m[2].match(/=+$/)?.[0].length) || 0;
  const bytes = Math.floor((m[2].length * 3) / 4) - padding;
  if (bytes > config.maxImageBytes) throw httpError(400, 'image too large');
  return src;
}

export async function fetchImageAsDataUri(src) {
  if (config.allowedImageHosts.length === 0) {
    throw httpError(400, 'remote image elements are disabled (ALLOWED_IMAGE_HOSTS is empty)');
  }
  const url = new URL(src);
  if (!/^https?:$/.test(url.protocol)) throw httpError(400, 'image src must be http(s)');
  if (!config.allowedImageHosts.includes(url.hostname)) {
    throw httpError(400, `image host not allowed: ${url.hostname}`);
  }
  const addrs = await dns.lookup(url.hostname, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw httpError(400, 'image host resolves to a private address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.imageFetchTimeoutMs);
  let resp;
  try {
    resp = await fetch(url, { signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw httpError(400, `image fetch failed: ${resp.status}`);
  const ct = resp.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw httpError(400, 'image src is not an image');

  const declared = Number(resp.headers.get('content-length') || 0);
  if (declared && declared > config.maxImageBytes) throw httpError(400, 'image too large');
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength > config.maxImageBytes) throw httpError(400, 'image too large');

  return `data:${ct};base64,${buf.toString('base64')}`;
}
