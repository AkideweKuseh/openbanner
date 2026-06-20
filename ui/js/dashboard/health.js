/* ═══════════════════════════════════════════════════════════
   OpenBanner — Dashboard: Health Status
   ═══════════════════════════════════════════════════════════ */

import { api } from '../api.js';

let healthInterval = null;

export function init() {
  document.getElementById('btn-refresh-health').addEventListener('click', checkHealth);
}

export function startPolling() {
  checkHealth();
  if (!healthInterval) {
    healthInterval = setInterval(checkHealth, 10000);
  }
}

export function stopPolling() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

async function checkHealth() {
  if (!api.isConfigured) {
    setStatus('health-api', 'unknown', ICONS.unknown, 'API not configured');
    setStatus('health-chromium', 'unknown', ICONS.unknown, 'API not configured');
    setBadge('health-api-badge', 'amber', 'Not configured');
    setBadge('health-chromium-badge', 'amber', 'Not configured');
    return;
  }

  const now = new Date();
  document.getElementById('health-last-check').textContent = now.toLocaleTimeString();

  // Check API health
  try {
    await api.getHealth();
    setStatus('health-api', 'ok', ICONS.ok, 'API is responding');
    setBadge('health-api-badge', 'green', 'Healthy');
  } catch (err) {
    setStatus('health-api', 'error', ICONS.error, err.message);
    setBadge('health-api-badge', 'red', 'Unreachable');
  }

  // Check Chromium readiness
  try {
    const result = await api.getReadiness();
    if (result.ok) {
      setStatus('health-chromium', 'ok', ICONS.ok, 'Chromium connected and ready');
      setBadge('health-chromium-badge', 'green', 'Ready');
    } else {
      setStatus('health-chromium', 'error', ICONS.warning, 'Chromium not ready');
      setBadge('health-chromium-badge', 'amber', 'Not ready');
    }
  } catch (err) {
    setStatus('health-chromium', 'error', ICONS.error, err.message);
    setBadge('health-chromium-badge', 'red', 'Unreachable');
  }
}

const ICONS = {
  unknown: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  ok: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  error: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
  warning: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
};

function setStatus(prefix, status, icon, detail) {
  const indicator = document.getElementById(`${prefix}-indicator`);
  const detailEl = document.getElementById(`${prefix}-detail`);

  indicator.innerHTML = icon;
  indicator.className = `health-card__indicator health-card__indicator--${status}`;
  detailEl.textContent = detail;
}

function setBadge(id, color, text) {
  const badge = document.getElementById(id);
  badge.className = `badge badge--${color}`;
  badge.innerHTML = `<span class="badge__dot"></span> ${text}`;
}
