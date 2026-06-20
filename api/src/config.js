const PLACEHOLDER = /^__CHANGE_ME__$/;

function fail(msg) {
  console.error(`[config] ${msg}`);
  process.exit(1);
}
function required(name) {
  const v = process.env[name];
  if (!v || PLACEHOLDER.test(v)) fail(`${name} must be set to a real value`);
  return v;
}
function int(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`${name} must be numeric`);
  return n;
}
function bool(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  return /^(1|true|yes)$/i.test(v);
}

export const config = {
  port: int('PORT', 3000),
  apiToken: required('API_SECRET_TOKEN'),
  // Number of reverse-proxy hops in front of the app (for correct client IP / rate
  // limiting). Dev = 1 (one nginx). Prod behind host nginx + Docker nginx = 2.
  trustProxy: int('TRUST_PROXY', 1),
  allowedImageHosts: (process.env.ALLOWED_IMAGE_HOSTS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  renderConcurrency: int('RENDER_CONCURRENCY', 3),
  renderQueueMax: int('RENDER_QUEUE_MAX', 50),
  renderTimeoutMs: int('RENDER_TIMEOUT_MS', 15000),
  imageFetchTimeoutMs: int('IMAGE_FETCH_TIMEOUT_MS', 5000),
  maxImageBytes: int('MAX_IMAGE_BYTES', 5 * 1024 * 1024),
  bodyLimit: process.env.BODY_LIMIT || '512kb',
  templatesDir: process.env.TEMPLATES_DIR || '/data/templates',
  // ── Object storage (MinIO/S3) for uploaded source images ──
  // Enabled only when MINIO_ENDPOINT is set. When disabled, uploads return 503 and
  // the designer falls back to inline data: URIs (still fully supported everywhere).
  storage: {
    get enabled() { return Boolean(process.env.MINIO_ENDPOINT); },
    endpoint: process.env.MINIO_ENDPOINT || '',
    port: int('MINIO_PORT', 9000),
    useSSL: bool('MINIO_USE_SSL', false),
    accessKey: process.env.MINIO_APP_USER || '',
    secretKey: process.env.MINIO_APP_PASSWORD || '',
    bucket: process.env.MINIO_BUCKET_NAME || '',
    // Object-name prefix that separates uploaded source images from rendered output.
    uploadsPrefix: process.env.MINIO_UPLOADS_PREFIX || 'uploads/',
  },
  // Comma-separated list of origins allowed to call the API from a browser (CORS).
  // Include '*' to allow any (dev only). Empty (default) = no CORS headers = locked down.
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  rateWindowMs: int('RATE_WINDOW_MS', 60000),
  rateMax: int('RATE_MAX', 120),
  shutdownTimeoutMs: int('SHUTDOWN_TIMEOUT_MS', 10000),
  logLevel: process.env.LOG_LEVEL || 'info',
  chromeNoSandbox: bool('CHROME_NO_SANDBOX', true),
  get chromeArgs() {
    const args = ['--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio'];
    if (this.chromeNoSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
    return args;
  },
};
