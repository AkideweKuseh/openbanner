/* ═══════════════════════════════════════════════════════════
   OpenBanner — Dashboard: Metrics
   ═══════════════════════════════════════════════════════════ */

import { api, parsePrometheus } from '../api.js';

let refreshInterval = null;
let metricsHistory = [];

export function init() {
  // Will start polling when dashboard becomes visible
}

export function startPolling() {
  fetchMetrics();
  if (!refreshInterval) {
    refreshInterval = setInterval(fetchMetrics, 5000);
  }
}

export function stopPolling() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function fetchMetrics() {
  if (!api.isConfigured) {
    setPlaceholders('Configure API');
    return;
  }

  try {
    const text = await api.getMetrics();
    const metrics = parsePrometheus(text);
    updateMetricCards(metrics);
  } catch (err) {
    setPlaceholders('Error');
  }
}

function updateMetricCards(metrics) {
  // Total renders = sum of render_duration_seconds_count
  const renderCount = getMetricValue(metrics, 'render_duration_seconds_count');
  document.getElementById('metric-total-renders').textContent = formatNumber(renderCount);
  document.getElementById('metric-total-renders-sub').textContent = 'Total renders processed';

  // Average duration = render_duration_seconds_sum / render_duration_seconds_count
  const renderSum = getMetricValue(metrics, 'render_duration_seconds_sum');
  const avgDuration = renderCount > 0 ? renderSum / renderCount : 0;
  document.getElementById('metric-avg-duration').textContent = avgDuration > 0
    ? avgDuration.toFixed(2) + 's'
    : '—';
  document.getElementById('metric-avg-duration-sub').textContent = renderCount > 0
    ? `Over ${renderCount} renders`
    : 'No data yet';

  // Queue depth — from render_queue_wait_seconds_count (approximate, shows throughput)
  const queueCount = getMetricValue(metrics, 'render_queue_wait_seconds_count');
  document.getElementById('metric-queue-depth').textContent = formatNumber(queueCount);
  document.getElementById('metric-queue-depth-sub').textContent = 'Tasks processed through queue';

  // Error rate = render_errors_total
  const errors = getSummedMetric(metrics, 'render_errors_total');
  document.getElementById('metric-error-rate').textContent = formatNumber(errors);
  const errorRate = renderCount > 0 ? ((errors / renderCount) * 100).toFixed(1) : '0';
  document.getElementById('metric-error-rate-sub').textContent = `${errorRate}% error rate`;

  // Track history for sparklines
  metricsHistory.push({
    ts: Date.now(),
    renders: renderCount,
    avgMs: avgDuration * 1000,
    errors: errors,
  });
  if (metricsHistory.length > 30) metricsHistory.shift();
}

function getMetricValue(metrics, name) {
  const entries = metrics.get(name);
  if (!entries || entries.length === 0) return 0;
  // Sum all entries (there might be label variants)
  return entries.reduce((sum, e) => sum + (e.value || 0), 0);
}

function getSummedMetric(metrics, name) {
  const entries = metrics.get(name);
  if (!entries || entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + (e.value || 0), 0);
}

function formatNumber(n) {
  if (n === 0 || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function setPlaceholders(text) {
  document.getElementById('metric-total-renders').textContent = '—';
  document.getElementById('metric-avg-duration').textContent = '—';
  document.getElementById('metric-queue-depth').textContent = '—';
  document.getElementById('metric-error-rate').textContent = '—';

  const sub = text;
  document.getElementById('metric-total-renders-sub').textContent = sub;
  document.getElementById('metric-avg-duration-sub').textContent = sub;
  document.getElementById('metric-queue-depth-sub').textContent = sub;
  document.getElementById('metric-error-rate-sub').textContent = sub;
}
