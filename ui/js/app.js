/* ═══════════════════════════════════════════════════════════
   OpenBanner — App Entry Point
   ═══════════════════════════════════════════════════════════ */

import { api } from './api.js';
import * as auth from './auth.js';
import * as Canvas from './designer/canvas.js';
import * as Properties from './designer/properties.js';
import * as Toolbar from './designer/toolbar.js';
import * as Metrics from './dashboard/metrics.js';
import * as Health from './dashboard/health.js';
import * as Renders from './dashboard/renders.js';
import * as Templates from './designer/templates.js';

/* ── Tab Routing ── */

const tabs = document.querySelectorAll('.slim-nav__btn[data-tab]');
const views = {
  designer: document.getElementById('view-designer'),
  dashboard: document.getElementById('view-dashboard'),
};

function switchTab(tabName) {
  // Leaving the designer: persist any open template + reset header chrome
  if (tabName !== 'designer') {
    Templates.saveIfActive();
    document.body.classList.remove('ds-home');
  }

  // Dashboard gets a minimal header (CSS hides the editor toolbar under this class).
  document.body.classList.toggle('dashboard-view', tabName === 'dashboard');

  tabs.forEach(t => {
    t.classList.toggle('slim-nav__btn--active', t.dataset.tab === tabName);
  });
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle('view--active', name === tabName);
  });

  // Start/stop polling
  if (tabName === 'dashboard') {
    Metrics.startPolling();
    Health.startPolling();
    Renders.renderGallery();
  } else {
    Metrics.stopPolling();
    Health.stopPolling();
  }

  // Entering the designer → show the template grid home
  if (tabName === 'designer') {
    Templates.enterDesigner();
  }

  window.location.hash = tabName;
}

// Tab click handlers
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

/* ── API Key Modal ── */

const apiKeyModal = document.getElementById('api-key-modal');

document.getElementById('btn-api-key').addEventListener('click', () => {
  document.getElementById('input-api-url').value = api.baseUrl;
  document.getElementById('input-api-key').value = api.apiKey;
  apiKeyModal.classList.add('modal-backdrop--open');
});

document.getElementById('btn-cancel-api-key').addEventListener('click', () => {
  apiKeyModal.classList.remove('modal-backdrop--open');
});

document.getElementById('btn-save-api-key').addEventListener('click', () => {
  const url = document.getElementById('input-api-url').value.trim();
  const key = document.getElementById('input-api-key').value.trim();

  if (!url) {
    Toolbar.showToast('Please enter the API base URL', 'error');
    return;
  }
  if (!key) {
    Toolbar.showToast('Please enter your API key', 'error');
    return;
  }

  api.configure(url, key);
  apiKeyModal.classList.remove('modal-backdrop--open');
  updateApiKeyStatus();
  Toolbar.showToast('API connected successfully', 'success');
});

// Close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      backdrop.classList.remove('modal-backdrop--open');
    }
  });
});

function updateApiKeyStatus() {
  const statusEl = document.getElementById('api-key-status');
  if (!statusEl) return;
  if (api.isConfigured) {
    statusEl.textContent = 'Connected';
    statusEl.style.color = 'var(--ob-accent-green)';
  } else {
    statusEl.textContent = 'Set API Key';
    statusEl.style.color = '';
  }
}

/* ── Auth Gate ── */

function bindLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    const res = auth.login(email, pwd);
    if (!res.ok) {
      errEl.textContent = res.error;
      return;
    }
    errEl.textContent = '';
    startApp();
  });
}

function doLogout() {
  Templates.saveIfActive();
  auth.logout();
  // Hide app, show login gate
  document.body.classList.remove('authed');
  document.body.classList.remove('ds-home');
  Metrics.stopPolling();
  Health.stopPolling();

  const form = document.getElementById('login-form');
  if (form) form.reset();
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.textContent = '';
  document.getElementById('login-email').focus();
}

/* ── App Bootstrap (after auth) ── */

function startApp() {
  document.body.classList.add('authed'); // hide login gate

  // Route based on URL hash (default → dashboard)
  const hash = window.location.hash.replace('#', '');
  const initial = (hash === 'designer' || hash === 'dashboard') ? hash : 'dashboard';
  switchTab(initial);

  window.addEventListener('resize', () => {
    if (views.designer.classList.contains('view--active')) {
      // Only refit when the editor (not the home grid) is visible
      if (!document.body.classList.contains('ds-home')) {
        Canvas.fitToViewport();
      }
    }
  });

  // Show API key modal only on a truly fresh install — i.e. the user has never
  // configured the API. Returning users (even with a cleared key) aren't nagged and can
  // reopen it via the API Settings button in the slim nav.
  if (!api.configuredOnce) {
    setTimeout(() => apiKeyModal.classList.add('modal-backdrop--open'), 800);
  }
}

/* ── Initialization ── */

function init() {
  // Init all modules (safe even before login — elements exist, just hidden)
  Canvas.init();
  Properties.init();
  Toolbar.init();
  Templates.init();
  Metrics.init();
  Health.init();
  Renders.init();

  updateApiKeyStatus();
  bindLogin();
  document.getElementById('btn-logout').addEventListener('click', doLogout);

  if (auth.isAuthenticated()) {
    startApp();
  }
  // else: login gate remains visible (its default state) until the user signs in

  console.log(
    '%cOpenBanner UI loaded',
    'color: #65a30d; font-size: 14px; font-weight: bold;'
  );
}

// Kick off
init();
