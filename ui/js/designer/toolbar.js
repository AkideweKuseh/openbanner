/* ═══════════════════════════════════════════════════════════
   OpenBanner — Toolbar & Export
   ═══════════════════════════════════════════════════════════ */

import * as Elements from './elements.js';
import * as Canvas from './canvas.js';
import { api } from '../api.js';
import { history } from './history.js';
import { loadPresets } from './presets.js';

let lastRenderedBlob = null;

export function init() {
  // ── Add Element Buttons ──
  document.getElementById('add-text').addEventListener('click', () => Elements.addText());
  document.getElementById('add-rect').addEventListener('click', () => Elements.addRect());
  document.getElementById('add-image').addEventListener('click', () => {
    Elements.addImage();
  });

  // ── Drag & Drop Elements ──
  const setDragData = (e, type) => {
    e.dataTransfer.setData('application/ob-element-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };
  document.getElementById('add-text').addEventListener('dragstart', e => setDragData(e, 'text'));
  document.getElementById('add-rect').addEventListener('dragstart', e => setDragData(e, 'rect'));
  document.getElementById('add-image').addEventListener('dragstart', e => setDragData(e, 'image'));

  // ── Canvas Presets ──
  const presetsGrid = document.getElementById('canvas-presets');
  presetsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const w = parseInt(btn.dataset.w);
    const h = parseInt(btn.dataset.h);
    Canvas.setCanvasSize(w, h);

    // Update active state
    presetsGrid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
    btn.classList.add('preset-btn--active');
  });

  // ── Zoom Controls ──
  document.getElementById('btn-zoom-in').addEventListener('click', () => Canvas.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click', () => Canvas.zoomOut());
  document.getElementById('btn-zoom-fit').addEventListener('click', () => Canvas.fitToViewport());

  // ── Undo / Redo ──
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  btnUndo.addEventListener('click', () => {
    const state = history.undo();
    if (state) Elements.replaceAll(state.elements, state.selectedId);
  });
  btnRedo.addEventListener('click', () => {
    const state = history.redo();
    if (state) Elements.replaceAll(state.elements, state.selectedId);
  });

  history.onChange((canUndo, canRedo) => {
    btnUndo.disabled = !canUndo;
    btnRedo.disabled = !canRedo;
    btnUndo.style.opacity = canUndo ? '1' : '0.3';
    btnRedo.style.opacity = canRedo ? '1' : '0.3';
  });

  // ── Delete / Duplicate ──
  document.getElementById('btn-delete-selected').addEventListener('click', () => {
    const sel = Elements.getSelectedId();
    if (sel) Elements.remove(sel);
  });
  document.getElementById('btn-duplicate').addEventListener('click', () => {
    const sel = Elements.getSelectedId();
    if (sel) Elements.duplicate(sel);
  });

  // ── Replace image (visible only when an image is selected) ──
  const btnReplaceImage = document.getElementById('btn-replace-image');
  if (btnReplaceImage) {
    btnReplaceImage.addEventListener('click', () => {
      const sel = Elements.getSelectedId();
      if (sel) Canvas.triggerImageUpload(undefined, undefined, sel);
    });
  }

  // ── Generate Button ──
  document.getElementById('btn-generate').addEventListener('click', openExportDrawer);

  // ── Export Drawer ──
  document.getElementById('btn-close-export').addEventListener('click', closeExportDrawer);
  document.getElementById('btn-render').addEventListener('click', doRender);
  document.getElementById('btn-download').addEventListener('click', doDownload);

  // Export format → toggle quality slider
  document.getElementById('export-format').addEventListener('change', (e) => {
    const qGroup = document.getElementById('export-quality-group');
    qGroup.style.display = e.target.value === 'png' ? 'none' : 'flex';
  });

  document.getElementById('export-quality').addEventListener('input', (e) => {
    document.getElementById('export-quality-value').textContent = e.target.value;
  });

  // ── JSON Import/Export ──
  document.getElementById('btn-json-export').addEventListener('click', exportJSON);
  document.getElementById('btn-json-import').addEventListener('click', importJSON);
}

function openExportDrawer() {
  document.getElementById('export-drawer').classList.add('export-drawer--open');
  // Reset
  document.getElementById('export-result').style.display = 'none';
  document.getElementById('export-placeholder').style.display = 'block';
  document.getElementById('export-loading').style.display = 'none';
  document.getElementById('btn-download').disabled = true;
  lastRenderedBlob = null;
}

function closeExportDrawer() {
  document.getElementById('export-drawer').classList.remove('export-drawer--open');
}

async function doRender() {
  if (!api.isConfigured) {
    showToast('Please set your API key first', 'error');
    return;
  }

  const format = document.getElementById('export-format').value;
  const quality = parseInt(document.getElementById('export-quality').value);
  const scale = parseInt(document.getElementById('export-scale').value);

  Canvas.setExportSettings({ format, quality, deviceScaleFactor: scale });
  const payload = Elements.toRenderPayload(Canvas.getCanvasState());

  // Show loading
  document.getElementById('export-placeholder').style.display = 'none';
  document.getElementById('export-result').style.display = 'none';
  document.getElementById('export-loading').style.display = 'flex';
  document.getElementById('btn-render').disabled = true;

  try {
    const blob = await api.renderBanner(payload);
    lastRenderedBlob = blob;

    const url = URL.createObjectURL(blob);
    const resultEl = document.getElementById('export-result');
    resultEl.innerHTML = `<img src="${url}" alt="Rendered banner">`;
    resultEl.style.display = 'block';
    document.getElementById('export-loading').style.display = 'none';
    document.getElementById('btn-download').disabled = false;

    // Save to render history
    saveToHistory(url, payload, blob.size);

    showToast('Banner rendered successfully', 'success');
  } catch (err) {
    document.getElementById('export-loading').style.display = 'none';
    document.getElementById('export-placeholder').style.display = 'block';
    document.getElementById('export-placeholder').textContent = err.message;
    showToast(err.message, 'error');
  } finally {
    document.getElementById('btn-render').disabled = false;
  }
}

function doDownload() {
  if (!lastRenderedBlob) return;
  const format = document.getElementById('export-format').value;
  const url = URL.createObjectURL(lastRenderedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `banner-${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  const payload = Elements.toRenderPayload(Canvas.getCanvasState());
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openbanner-design-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Design exported as JSON', 'success');
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = Elements.importFromJSON(text);
      if (data.width && data.height) {
        Canvas.setCanvasSize(data.width, data.height);
      }
      if (data.backgroundColor) {
        Canvas.setCanvasBackground(data.backgroundColor);
      }
      showToast('Design imported successfully', 'success');
    } catch (err) {
      showToast('Failed to import: ' + err.message, 'error');
    }
  });
  input.click();
}

/* ── Export ── */

/* ── Render History (localStorage) ── */

function saveToHistory(imageUrl, payload, size) {
  try {
    const history = JSON.parse(localStorage.getItem('ob_render_history') || '[]');

    // Convert blob URL to a small data URL for persistence
    // We'll store the config, not the image itself (too large for localStorage)
    history.unshift({
      timestamp: Date.now(),
      config: payload,
      size: size,
      format: payload.format,
      dimensions: `${payload.width}×${payload.height}`,
    });

    // Keep last 50
    if (history.length > 50) history.length = 50;
    localStorage.setItem('ob_render_history', JSON.stringify(history));

    // Dispatch event for dashboard
    window.dispatchEvent(new CustomEvent('ob:render-saved'));
  } catch { /* localStorage might be full */ }
}

/* ── Toast Helper ── */

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
