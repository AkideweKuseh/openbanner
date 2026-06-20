/* ═══════════════════════════════════════════════════════════
   OpenBanner — Templates (home grid + active template + save)
   ═══════════════════════════════════════════════════════════ */

import * as Canvas from './canvas.js';
import * as Elements from './elements.js';
import { api } from '../api.js';
import { showToast } from './toolbar.js';

const STORAGE_KEY = 'ob_custom_templates';

// In-memory cache
let customTemplates = [];
// The template currently open in the editor (null when on home grid)
let activeTemplateId = null;

export function init() {
  loadTemplates();
  bindEvents();
}

function $(id) { return document.getElementById(id); }

function bindEvents() {
  // Create buttons (header home + empty state) → modal
  $('btn-create-template')?.addEventListener('click', openCreateModal);
  $('btn-create-template-empty')?.addEventListener('click', openCreateModal);

  // Modal
  $('btn-cancel-template')?.addEventListener('click', closeCreateModal);
  $('btn-confirm-create-template')?.addEventListener('click', confirmCreateTemplate);

  // Editor actions
  $('btn-save-template')?.addEventListener('click', saveActiveTemplate);
  $('btn-back-home')?.addEventListener('click', goHome);
  $('active-template-name')?.addEventListener('change', renameActive);

  // API template: publish + export endpoint
  $('btn-publish-api')?.addEventListener('click', publishToApi);
  $('btn-export-api')?.addEventListener('click', exportApiCall);
  $('btn-close-export-api')?.addEventListener('click', () =>
    $('export-api-modal')?.classList.remove('modal-backdrop--open'));

  // Modal size preset selector
  const modalPresetsGrid = $('modal-template-presets');
  const groupCustom = $('group-template-custom-size');
  if (modalPresetsGrid && groupCustom) {
    modalPresetsGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-btn');
      if (!btn) return;
      modalPresetsGrid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
      btn.classList.add('preset-btn--active');
      groupCustom.style.display = btn.dataset.size === 'custom' ? 'flex' : 'none';
    });
  }
}

/* ── Mode switching (home grid vs editor) ── */

function setDesignerMode(mode) {
  const view = $('view-designer');
  if (!view) return;
  view.classList.toggle('designer--home', mode === 'home');
  view.classList.toggle('designer--editor', mode === 'editor');
  // body.ds-home drives the conditional header chrome
  document.body.classList.toggle('ds-home', mode === 'home');
}

/** Called by app.js when the user navigates into the Designer tab. */
export function enterDesigner() {
  setDesignerMode('home');
  activeTemplateId = null;
  renderGrid();
}

/* ── Persistence ── */

function loadTemplates() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      customTemplates = JSON.parse(data);
    } else {
      // Seed a friendly starter template on first run
      customTemplates = [{
        id: 'tpl_welcome',
        name: 'Welcome Banner',
        width: 1200,
        height: 630,
        backgroundColor: '#111827',
        elements: [
          { type: 'text', text: 'OpenBanner', left: 80, top: 180, fontFamily: 'Inter', fontSize: 104, color: '#ccff00', fontWeight: 'bold' },
          { type: 'text', text: 'Design beautiful banners in minutes', left: 84, top: 330, fontFamily: 'Inter', fontSize: 34, color: '#e5e7eb', fontWeight: 'normal' }
        ]
      }];
      saveToStorage();
    }
  } catch (err) {
    console.error('Failed to load templates', err);
    customTemplates = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));
}

/* ── Home grid rendering ── */

function renderGrid() {
  const grid = $('custom-templates-grid');
  const empty = $('home-empty');
  if (!grid || !empty) return;

  if (customTemplates.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';

  grid.innerHTML = customTemplates.map(t => {
    const rawRatio = (t.height > 0) ? (t.width / t.height) : (16 / 9);
    // Clamp to a landscape rectangle so every card looks uniform — never tall/square
    const ratio = Math.min(Math.max(rawRatio, 16 / 9), 2.4);
    const layers = (t.elements || []).length;
    return `
      <div class="tpl-card" data-id="${escapeHtml(t.id)}" role="button" tabindex="0" aria-label="Open template ${escapeHtml(t.name)}">
        <div class="tpl-card__preview" style="background:${safeColor(t.backgroundColor)}; aspect-ratio:${ratio};">
          <span class="tpl-card__preview-tag">${parseInt(t.width) || 0} × ${parseInt(t.height) || 0}</span>
        </div>
        <div class="tpl-card__footer">
          <div class="tpl-card__meta">
            <div class="tpl-card__name">${escapeHtml(t.name)}</div>
            <div class="tpl-card__sub">${layers} layer${layers === 1 ? '' : 's'}</div>
          </div>
          <button class="tpl-card__delete" data-id="${escapeHtml(t.id)}" aria-label="Delete template" title="Delete template">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.tpl-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.tpl-card__delete')) return;
      openTemplate(card.dataset.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTemplate(card.dataset.id);
      }
    });
  });

  grid.querySelectorAll('.tpl-card__delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTemplate(btn.dataset.id);
    });
  });
}

/* ── Open / Create / Save ── */

function openTemplate(id) {
  const tpl = customTemplates.find(t => t.id === id);
  if (!tpl) return;
  activeTemplateId = id;

  Canvas.setCanvasSize(tpl.width, tpl.height);
  Canvas.setCanvasBackground(tpl.backgroundColor || '#ffffff');
  Elements.replaceAll(tpl.elements || []);

  const nameInput = $('active-template-name');
  if (nameInput) nameInput.value = tpl.name;

  setDesignerMode('editor');
  requestAnimationFrame(() => Canvas.fitToViewport());

  showToast(`Opened "${tpl.name}"`, 'success');
}

function openCreateModal() {
  $('input-template-name').value = '';
  $('group-template-custom-size').style.display = 'none';

  const modalPresetsGrid = $('modal-template-presets');
  if (modalPresetsGrid) {
    modalPresetsGrid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
    const og = modalPresetsGrid.querySelector('[data-size="1200x630"]') || modalPresetsGrid.querySelector('.preset-btn');
    og?.classList.add('preset-btn--active');
  }
  $('input-template-w').value = 1200;
  $('input-template-h').value = 630;

  $('create-template-modal').classList.add('modal-backdrop--open');
  $('input-template-name').focus();
}

function closeCreateModal() {
  $('create-template-modal').classList.remove('modal-backdrop--open');
}

/** Create a NEW blank template (does not snapshot the canvas). */
function confirmCreateTemplate() {
  const nameInput = $('input-template-name');
  const name = (nameInput.value || '').trim() || 'Untitled Template';

  let sizeType = '1200x630';
  const activeBtn = document.querySelector('#modal-template-presets .preset-btn--active');
  if (activeBtn) sizeType = activeBtn.dataset.size;

  let width, height;
  if (sizeType === 'custom') {
    width = parseInt($('input-template-w').value) || 1200;
    height = parseInt($('input-template-h').value) || 630;
  } else if (sizeType === 'current') {
    const s = Canvas.getCanvasState();
    width = s.width; height = s.height;
  } else {
    const parts = sizeType.split('x');
    width = parseInt(parts[0]);
    height = parseInt(parts[1]);
  }

  const newTemplate = {
    id: 'tpl_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name,
    width,
    height,
    backgroundColor: '#ffffff',
    elements: []
  };

  customTemplates.unshift(newTemplate);
  saveToStorage();
  closeCreateModal();
  showToast(`Created "${name}"`, 'success');

  openTemplate(newTemplate.id);
}

/** Save the open template, overwriting it in place. */
function saveActiveTemplate(silent = false) {
  if (!activeTemplateId) {
    showToast('Open a template to save', 'error');
    return;
  }
  const tpl = customTemplates.find(t => t.id === activeTemplateId);
  if (!tpl) return;

  const nameInput = $('active-template-name');
  if (nameInput) tpl.name = (nameInput.value || '').trim() || tpl.name;

  const state = Canvas.getCanvasState();
  const payload = Elements.toRenderPayload(state);
  tpl.width = state.width;
  tpl.height = state.height;
  tpl.backgroundColor = state.backgroundColor;
  tpl.elements = payload.elements || [];

  saveToStorage();
  renderGrid();
  if (!silent) showToast('Template saved', 'success');
}

function renameActive() {
  if (!activeTemplateId) return;
  const tpl = customTemplates.find(t => t.id === activeTemplateId);
  if (!tpl) return;
  const nameInput = $('active-template-name');
  if (nameInput) tpl.name = (nameInput.value || '').trim() || tpl.name;
  saveToStorage();
}

/** Back to home grid — auto-saves the open template first. */
function goHome() {
  if (activeTemplateId) saveActiveTemplate(true);
  activeTemplateId = null;
  Elements.deselect();
  setDesignerMode('home');
  renderGrid();
}

/* ── Publish to API + Export endpoint ── */

/** Build the server-template payload from the current canvas (layout only — no format). */
function buildApiPayload(tpl) {
  const payload = Elements.toRenderPayload(Canvas.getCanvasState());
  return {
    name: tpl.name,
    width: payload.width,
    height: payload.height,
    backgroundColor: payload.backgroundColor,
    elements: payload.elements, // _id already stripped; carries `slot` where set
  };
}

/** Publish the open template to the API (create or update), then show its endpoint. */
async function publishToApi() {
  if (!activeTemplateId) { showToast('Open a template first', 'error'); return; }
  const tpl = customTemplates.find(t => t.id === activeTemplateId);
  if (!tpl) return;
  if (!api.isConfigured) { showToast('Set your API key first', 'error'); return; }

  const templatePayload = buildApiPayload(tpl);
  showToast('Publishing to API…', 'info');
  try {
    const data = tpl.apiId
      ? await api.updateTemplate(tpl.apiId, templatePayload)
      : await api.createTemplate(templatePayload);
    tpl.apiId = data.id;
    tpl.apiSlots = data.slots || [];
    saveToStorage();
    showToast(`Published as ${data.id}`, 'success');
    openExportApi(data.id, tpl.apiSlots, tpl.name);
  } catch (err) {
    showToast('Publish failed: ' + err.message, 'error');
  }
}

/** Reopen the export panel for the open template (must already be published). */
function exportApiCall() {
  if (!activeTemplateId) { showToast('Open a template first', 'error'); return; }
  const tpl = customTemplates.find(t => t.id === activeTemplateId);
  if (!tpl) return;
  if (!tpl.apiId) { showToast('Publish this template to the API first', 'error'); return; }
  openExportApi(tpl.apiId, tpl.apiSlots || [], tpl.name);
}

/** Render the dynamic endpoint/body/curl export panel for a published template. */
function openExportApi(apiId, slots, name) {
  const base = (api.baseUrl || '').replace(/\/+$/, '');
  const endpoint = `${base}/v1/templates/${apiId}/render`;
  const mergeVars = {};
  for (const s of slots) mergeVars[s] = '';
  const body = JSON.stringify({ format: 'png', mergeVars }, null, 2);
  const curl = [
    `curl -X POST ${endpoint} \\`,
    `  -H "X-API-Key: ${api.apiKey}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}' \\`,
    `  --output banner.png`,
  ].join('\n');

  const nameEl = $('export-api-name');
  if (nameEl) nameEl.textContent = name || 'Template';
  // DOM-built (textContent) — no innerHTML, so endpoint/id/slots can't inject markup.
  $('export-api-body').replaceChildren(
    makeCopyBlock('Endpoint', `POST ${endpoint}`),
    makeCopyBlock('Request body (JSON)', body),
    makeCopyBlock('cURL (ready to run)', curl),
  );
  $('export-api-modal').classList.add('modal-backdrop--open');
}

/** Build a labeled copy block via DOM APIs; the Copy button owns its <pre> directly. */
function makeCopyBlock(label, text) {
  const group = document.createElement('div');
  group.className = 'form-group';
  group.style.marginBottom = 'var(--ob-space-3)';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';

  const lab = document.createElement('span');
  lab.className = 'form-label';
  lab.style.margin = '0';
  lab.textContent = label;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--ghost btn--sm ob-copy-btn';
  btn.textContent = 'Copy';

  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;font-family:var(--ob-font-mono,monospace);white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e5e7eb;';
  pre.textContent = text;

  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(pre.textContent)
      .then(() => showToast('Copied to clipboard', 'success'))
      .catch(() => showToast('Copy failed', 'error'));
  });

  head.append(lab, btn);
  group.append(head, pre);
  return group;
}

/** Persist the open template (if any) without leaving the editor. Used on tab switch/logout. */
export function saveIfActive() {
  if (activeTemplateId) saveActiveTemplate(true);
}

/** Build a new template from a render-config payload (e.g. a dashboard render) and open it. */
export function openFromConfig(config) {
  if (!config) return;
  const tpl = {
    id: 'tpl_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: 'Imported Design',
    width: config.width || 1200,
    height: config.height || 630,
    backgroundColor: safeColor(config.backgroundColor),
    elements: (config.elements || []).map(({ _id, ...rest }) => rest)
  };
  customTemplates.unshift(tpl);
  saveToStorage();
  openTemplate(tpl.id);
}

function deleteTemplate(id) {
  const tpl = customTemplates.find(t => t.id === id);
  if (!tpl) return;
  if (!confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
  customTemplates = customTemplates.filter(t => t.id !== id);
  if (activeTemplateId === id) activeTemplateId = null;
  saveToStorage();
  renderGrid();
  showToast('Template deleted', 'success');
}

function escapeHtml(unsafe) {
  return (unsafe || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Only allow hex colors into CSS contexts; reject anything else (CSS injection guard). */
function safeColor(c) {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#f3f4f6';
}
