/* ═══════════════════════════════════════════════════════════
   OpenBanner — API Client
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY_URL = 'ob_api_url';
const STORAGE_KEY_KEY = 'ob_api_key';

class OpenBannerAPI {
  constructor() {
    this.baseUrl = sessionStorage.getItem(STORAGE_KEY_URL) || '';
    this.apiKey = sessionStorage.getItem(STORAGE_KEY_KEY) || '';
  }

  get isConfigured() {
    return this.baseUrl.length > 0 && this.apiKey.length > 0;
  }

  configure(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    sessionStorage.setItem(STORAGE_KEY_URL, this.baseUrl);
    sessionStorage.setItem(STORAGE_KEY_KEY, this.apiKey);
  }

  clear() {
    this.baseUrl = '';
    this.apiKey = '';
    sessionStorage.removeItem(STORAGE_KEY_URL);
    sessionStorage.removeItem(STORAGE_KEY_KEY);
  }

  /** POST /v1/render — returns a Blob (image) */
  async renderBanner(payload) {
    const resp = await fetch(`${this.baseUrl}/v1/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      let detail = '';
      try {
        const json = await resp.json();
        detail = json.error || json.message || '';
      } catch { /* ignore */ }
      throw new Error(`Render failed (${resp.status}): ${detail || resp.statusText}`);
    }

    return await resp.blob();
  }

  /** GET /healthz — liveness check */
  async getHealth() {
    const resp = await fetch(`${this.baseUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`);
    return await resp.json();
  }

  /** GET /readyz — readiness check (Chromium connected) */
  async getReadiness() {
    const resp = await fetch(`${this.baseUrl}/readyz`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return { ok: resp.ok, ...data };
  }

  /** POST /v1/templates — store a reusable template; returns {id, slots, ...} */
  async createTemplate(payload) {
    const resp = await fetch(`${this.baseUrl}/v1/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Publish failed (${resp.status}): ${data.error || resp.statusText}`);
    return data;
  }

  /** GET /v1/templates — list stored templates (summaries) */
  async listTemplates() {
    const resp = await fetch(`${this.baseUrl}/v1/templates`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    const data = await resp.json().catch(() => []);
    if (!resp.ok) throw new Error(`List failed (${resp.status})`);
    return data;
  }

  /** PUT /v1/templates/:id — update an existing template's layout/slots */
  async updateTemplate(id, payload) {
    const resp = await fetch(`${this.baseUrl}/v1/templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Update failed (${resp.status}): ${data.error || resp.statusText}`);
    return data;
  }

  /** POST /v1/images — upload a source image; returns {key, ref, url} */
  async uploadImage(file) {
    const resp = await fetch(`${this.baseUrl}/v1/images`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-API-Key': this.apiKey },
      body: file,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Upload failed (${resp.status}): ${data.error || resp.statusText}`);
    return data;
  }

  /**
   * Resolve an image element's `src` to a URL the browser can display. `ob-image:<key>`
   * references become public `/v1/images/<key>` URLs; data:/http(s) sources pass through.
   */
  imageUrl(src) {
    if (typeof src !== 'string') return src;
    const m = /^ob-image:([a-f0-9]{32})$/.exec(src);
    return m ? `${this.baseUrl}/v1/images/${m[1]}` : src;
  }

  /** GET /metrics — returns raw Prometheus text */
  async getMetrics() {
    const resp = await fetch(`${this.baseUrl}/metrics`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`Metrics failed: ${resp.status}`);
    return await resp.text();
  }
}

export const api = new OpenBannerAPI();

/**
 * Parse Prometheus text format into a Map<string, {value, labels, type}>
 */
export function parsePrometheus(text) {
  const metrics = new Map();
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    // Match: metric_name{labels} value OR metric_name value
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?(.*?)\}?\s+([\d.eE+-]+|NaN|Inf|-Inf)$/);
    if (!match) continue;

    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    const labels = {};

    if (labelsStr) {
      for (const pair of labelsStr.match(/(\w+)="([^"]*)"/g) || []) {
        const [k, v] = pair.split('=');
        labels[k] = v.replace(/"/g, '');
      }
    }

    if (!metrics.has(name)) {
      metrics.set(name, []);
    }
    metrics.get(name).push({ value, labels });
  }

  return metrics;
}
