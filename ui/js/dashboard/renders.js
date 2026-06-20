/* ═══════════════════════════════════════════════════════════
   OpenBanner — Dashboard: Recent Renders Gallery
   ═══════════════════════════════════════════════════════════ */

import * as Elements from '../designer/elements.js';
import * as Canvas from '../designer/canvas.js';
import * as Templates from '../designer/templates.js';
import { showToast } from '../designer/toolbar.js';

const STORAGE_KEY = 'ob_render_history';

export function init() {
  document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
  window.addEventListener('ob:render-saved', () => renderGallery());
  renderGallery();
}

export function renderGallery() {
  const history = getHistory();
  const empty = document.getElementById('renders-empty');
  const gallery = document.getElementById('renders-gallery');
  const count = document.getElementById('render-history-count');

  count.textContent = history.length;

  if (history.length === 0) {
    empty.style.display = 'flex';
    gallery.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  gallery.style.display = 'grid';
  gallery.innerHTML = '';

  for (const item of history) {
    const card = document.createElement('div');
    card.className = 'render-card';

    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleString();
    const sizeStr = formatBytes(item.size || 0);

    // Create a mini preview from the config
    const bgColor = item.config?.backgroundColor || '#1e1e24';
    const dims = item.dimensions || '?×?';

    card.innerHTML = `
      <div class="render-card__preview" style="background:${bgColor};">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;opacity:0.6;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          <span style="font-size:10px;color:var(--ob-text-tertiary);">${dims}</span>
        </div>
      </div>
      <div class="render-card__meta">
        <span class="render-card__time">${timeStr}</span>
        <span class="render-card__size">${sizeStr} · ${item.format || 'png'}</span>
      </div>
      <div style="padding:0 var(--ob-space-3) var(--ob-space-3);display:flex;gap:var(--ob-space-2);">
        <button class="btn btn--ghost btn--sm" data-action="load" style="flex:1;">Load Design</button>
        <button class="btn btn--ghost btn--sm" data-action="copy" style="flex:1;">Copy JSON</button>
      </div>
    `;

    // Bind actions
    card.querySelector('[data-action="load"]').addEventListener('click', (e) => {
      e.stopPropagation();
      loadDesign(item.config);
    });

    card.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
      e.stopPropagation();
      copyJSON(item.config);
    });

    gallery.appendChild(card);
  }
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function clearHistory() {
  if (!confirm('Clear all render history?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderGallery();
  showToast('History cleared', 'success');
}

function loadDesign(config) {
  if (!config) return;
  // Switch to designer (lands on home grid), then open the config as a new template in the editor
  document.getElementById('tab-designer').click();
  Templates.openFromConfig(config);
  showToast('Design loaded from history', 'success');
}

function copyJSON(config) {
  if (!config) return;
  const json = JSON.stringify(config, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    showToast('JSON copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
