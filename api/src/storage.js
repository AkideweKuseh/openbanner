import { randomBytes } from 'node:crypto';
import { Client as MinioClient } from 'minio';
import { config } from './config.js';
import { httpError } from './util.js';

// Opaque, unguessable object key (32 hex chars). The bucket object name is
// `${uploadsPrefix}${key}`; the reference stored in templates is `ob-image:${key}`.
const KEY_RE = /^[a-f0-9]{32}$/;
export const IMAGE_REF_RE = /^ob-image:([a-f0-9]{32})$/;

let client = null;
function getClient() {
  if (!config.storage.enabled) {
    throw httpError(503, 'image storage is not configured (MINIO_ENDPOINT unset)');
  }
  if (!client) {
    client = new MinioClient({
      endPoint: config.storage.endpoint,
      port: config.storage.port,
      useSSL: config.storage.useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
    });
  }
  return client;
}

export function isStorageEnabled() {
  return config.storage.enabled;
}

export function newImageKey() {
  return randomBytes(16).toString('hex');
}

export function isValidKey(key) {
  return KEY_RE.test(key);
}

/** Extract the bare key from an `ob-image:<key>` reference, or null if not one. */
export function refToKey(src) {
  const m = IMAGE_REF_RE.exec(src);
  return m ? m[1] : null;
}

function objectName(key) {
  return `${config.storage.uploadsPrefix}${key}`;
}

/** Store an uploaded image buffer; returns the generated key. */
export async function putImage(buf, contentType) {
  const key = newImageKey();
  await getClient().putObject(config.storage.bucket, objectName(key), buf, buf.byteLength, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  return key;
}

/**
 * Fetch a stored image as a Buffer plus its content-type. Enforces maxImageBytes.
 * Throws a 404 httpError when the object is missing.
 */
export async function getImage(key) {
  if (!isValidKey(key)) throw httpError(400, 'invalid image key');
  const c = getClient();
  let stat;
  try {
    stat = await c.statObject(config.storage.bucket, objectName(key));
  } catch (err) {
    if (err?.code === 'NotFound' || err?.code === 'NoSuchKey') throw httpError(404, 'image not found');
    throw err;
  }
  if (stat.size > config.maxImageBytes) throw httpError(400, 'image too large');
  const contentType = stat.metaData?.['content-type'] || 'application/octet-stream';

  const stream = await c.getObject(config.storage.bucket, objectName(key));
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > config.maxImageBytes) throw httpError(400, 'image too large');
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), contentType };
}
