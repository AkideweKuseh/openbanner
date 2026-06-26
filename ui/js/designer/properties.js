/* ═══════════════════════════════════════════════════════════
   OpenBanner — Property Inspector
   ═══════════════════════════════════════════════════════════ */

import * as Elements from './elements.js';
import * as Canvas from './canvas.js';

let inspectorContent, inspectorEmpty;

// The element currently rendered in the inspector, plus a spec describing which
// fields to refresh in place (without rebuilding) when a property changes — this is
// what keeps focus in the field you're typing in (see syncInspectorFields).
let currentEl = null;
let syncSpec = [];

export function init() {
  inspectorContent = document.getElementById('inspector-content');
  inspectorEmpty = document.getElementById('inspector-empty');

  // Full rebuild ONLY when the selection actually changes — never on every keystroke,
  // so typing in the Content field never destroys/recreates the input (which was the
  // root cause of the "greys out after one letter" + "Backspace deletes the box" bugs).
  Elements.onSelectChange((selectedId) => {
    if (selectedId) {
      const el = Elements.getById(selectedId);
      if (el) showElementProperties(el);
      else showEmpty();
    } else {
      showEmpty();
    }
  });

  // Lightweight in-place refresh on every property change (drag, resize, typing in
  // another field). Live canvas/layers updates are driven by their own onChange subs.
  Elements.onChange(() => {
    if (currentEl) {
      const fresh = Elements.getById(currentEl._id);
      if (fresh) syncInspectorFields(fresh);
    }
  });

  // Canvas background click handler
  window._showCanvasProperties = () => {
    showCanvasProperties();
  };
}

/** Update field values without rebuilding the DOM. Skips the field currently focused. */
function syncInspectorFields(el) {
  currentEl = el;
  for (const { id, prop, blank } of syncSpec) {
    const node = document.getElementById(id);
    if (!node) continue;
    if (node === document.activeElement) continue; // never disrupt the field in use
    const v = el[prop];
    try {
      node.value = (blank && (v === undefined || v === null)) ? '' : v;
    } catch { /* some inputs reject non-hex/odd values — ignore */ }
  }
}

function showEmpty() {
  currentEl = null;
  syncSpec = [];
  inspectorContent.style.display = 'none';
  inspectorEmpty.style.display = 'flex';
}

function showElementProperties(el) {
  inspectorEmpty.style.display = 'none';
  inspectorContent.style.display = 'block';

  if (el.type === 'text') renderTextInspector(el);
  else if (el.type === 'rect') renderRectInspector(el);
  else if (el.type === 'image') renderImageInspector(el);
}

function showCanvasProperties() {
  currentEl = null;
  syncSpec = [];
  inspectorEmpty.style.display = 'none';
  inspectorContent.style.display = 'block';

  const state = Canvas.getCanvasState();

  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Canvas Settings</span>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Dimensions</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Width</label>
          <input type="number" class="form-input form-input--sm" id="prop-canvas-w" value="${state.width}" min="16" max="4000">
        </div>
        <div class="form-group">
          <label class="form-label">Height</label>
          <input type="number" class="form-input form-input--sm" id="prop-canvas-h" value="${state.height}" min="16" max="4000">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Background</div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:var(--ob-space-2);align-items:center;">
          <input type="color" class="form-input" id="prop-canvas-bg" value="${state.backgroundColor}" style="width:40px;">
          <input type="text" class="form-input form-input--sm" id="prop-canvas-bg-text" value="${state.backgroundColor}" style="flex:1;font-family:var(--ob-font-mono);font-size:var(--ob-text-xs);">
        </div>
      </div>
    </div>
  `;

  // Bind events
  bindInput('prop-canvas-w', (v) => {
    const h = parseInt(document.getElementById('prop-canvas-h').value) || state.height;
    Canvas.setCanvasSize(parseInt(v), h);
  });
  bindInput('prop-canvas-h', (v) => {
    const w = parseInt(document.getElementById('prop-canvas-w').value) || state.width;
    Canvas.setCanvasSize(w, parseInt(v));
  });

  const bgColor = document.getElementById('prop-canvas-bg');
  const bgText = document.getElementById('prop-canvas-bg-text');
  bgColor.addEventListener('input', () => {
    bgText.value = bgColor.value;
    Canvas.setCanvasBackground(bgColor.value);
  });
  bgText.addEventListener('change', () => {
    bgColor.value = bgText.value;
    Canvas.setCanvasBackground(bgText.value);
  });
}

function renderTextInspector(el) {
  currentEl = el;
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Text Element</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Layer</div>
      <div class="form-group">
        <label class="form-label">Layer Name</label>
        <input type="text" class="form-input form-input--sm" id="prop-name" value="${escapeHTML(el.name || '')}" placeholder="Text">
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Content</div>
      <div class="form-group">
        <textarea class="form-input" id="prop-text" rows="3" style="resize:vertical;">${escapeHTML(el.text)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Template Slot (optional)</label>
        <input type="text" class="form-input form-input--sm" id="prop-slot" value="${escapeHTML(el.slot || '')}" placeholder="auto: ${autoSlotFor(el)}" style="font-family:var(--ob-font-mono);font-size:var(--ob-text-xs);">
        <div style="font-size:var(--ob-text-xs);color:var(--ob-text-muted);margin-top:4px;">Name this text to inject it by key when you render the template via the API. Blank = auto slot.</div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Position</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">X</label>
          <input type="number" class="form-input form-input--sm" id="prop-left" value="${el.left}">
        </div>
        <div class="form-group">
          <label class="form-label">Y</label>
          <input type="number" class="form-input form-input--sm" id="prop-top" value="${el.top}">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Typography</div>
      <div class="form-group">
        <label class="form-label">Font Family</label>
        <select class="form-input form-input--sm" id="prop-fontFamily">
          <option value="Inter" ${(!el.fontFamily || el.fontFamily === 'Inter') ? 'selected' : ''}>Inter</option>
          <option value="Roboto" ${el.fontFamily === 'Roboto' ? 'selected' : ''}>Roboto</option>
          <option value="Open Sans" ${el.fontFamily === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
          <option value="Montserrat" ${el.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
          <option value="Poppins" ${el.fontFamily === 'Poppins' ? 'selected' : ''}>Poppins</option>
          <option value="Playfair Display" ${el.fontFamily === 'Playfair Display' ? 'selected' : ''}>Playfair Display</option>
          <option value="Space Grotesk" ${el.fontFamily === 'Space Grotesk' ? 'selected' : ''}>Space Grotesk</option>
          <option value="JetBrains Mono" ${el.fontFamily === 'JetBrains Mono' ? 'selected' : ''}>JetBrains Mono</option>
        </select>
      </div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Font Size (px)</label>
          <input type="number" class="form-input form-input--sm" id="prop-fontSize" min="8" max="400" step="1" value="${el.fontSize}">
        </div>
        <div class="form-group">
          <label class="form-label">Preset</label>
          <select class="form-input form-input--sm" id="prop-fontSize-preset">
            <option value="">—</option>
            ${[12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 96, 128].map(s => `<option value="${s}" ${el.fontSize === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Weight</label>
          <select class="form-input form-input--sm" id="prop-fontWeight">
            <option value="normal" ${el.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="bold" ${el.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
            <option value="bolder" ${el.fontWeight === 'bolder' ? 'selected' : ''}>Bolder</option>
            <option value="lighter" ${el.fontWeight === 'lighter' ? 'selected' : ''}>Lighter</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Line Height</label>
          <input type="number" class="form-input form-input--sm" id="prop-lineHeight" min="0.1" max="10" step="0.05" value="${el.lineHeight != null ? el.lineHeight : ''}" placeholder="auto">
        </div>
      </div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Letter Spacing (px)</label>
          <input type="number" class="form-input form-input--sm" id="prop-letterSpacing" min="-50" max="200" step="0.5" value="${el.letterSpacing != null ? el.letterSpacing : ''}" placeholder="auto">
        </div>
        <div class="form-group">
          <label class="form-label">Alignment</label>
          <select class="form-input form-input--sm" id="prop-align">
            <option value="left" ${(!el.align || el.align === 'left') ? 'selected' : ''}>Left</option>
            <option value="center" ${el.align === 'center' ? 'selected' : ''}>Center</option>
            <option value="right" ${el.align === 'right' ? 'selected' : ''}>Right</option>
          </select>
        </div>
      </div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Width (px)</label>
          <input type="number" class="form-input form-input--sm" id="prop-width" min="1" max="4000" value="${el.width != null ? el.width : ''}" placeholder="auto">
        </div>
        <div class="form-group">
          <label class="form-label">Height (px)</label>
          <input type="number" class="form-input form-input--sm" id="prop-height" min="1" max="4000" value="${el.height != null ? el.height : ''}" placeholder="auto">
        </div>
      </div>
      <div style="font-size:var(--ob-text-xs);color:var(--ob-text-muted);">Width wraps the text into a box; Height clips it. Leave blank to auto-size. Drag the box on canvas to resize.</div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Appearance</div>
      <div class="form-group">
        <label class="form-label">Effect</label>
        <select class="form-input form-input--sm" id="prop-effect">
          <option value="none" ${el.effect === 'none' ? 'selected' : ''}>None (solid color)</option>
          <option value="gradient" ${el.effect === 'gradient' ? 'selected' : ''}>Gradient</option>
          <option value="neon" ${el.effect === 'neon' ? 'selected' : ''}>Neon Glow</option>
        </select>
      </div>
      <div class="form-group" id="color-group" ${el.effect !== 'none' ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
        <label class="form-label">Color</label>
        <div style="display:flex;gap:var(--ob-space-2);align-items:center;">
          <input type="color" class="form-input" id="prop-color" value="${escapeHTML(el.color)}" style="width:40px;">
          <input type="text" class="form-input form-input--sm" id="prop-color-text" value="${escapeHTML(el.color)}" style="flex:1;font-family:var(--ob-font-mono);font-size:var(--ob-text-xs;">
        </div>
      </div>
    </div>
  `;

  // Fields to refresh in place on external changes (drag/resize/undo). Color is excluded
  // (it only changes from this panel; setting type=color to non-hex can throw).
  syncSpec = [
    { id: 'prop-name', prop: 'name', blank: true },
    { id: 'prop-text', prop: 'text' },
    { id: 'prop-left', prop: 'left' },
    { id: 'prop-top', prop: 'top' },
    { id: 'prop-fontSize', prop: 'fontSize' },
    { id: 'prop-fontFamily', prop: 'fontFamily' },
    { id: 'prop-fontWeight', prop: 'fontWeight' },
    { id: 'prop-align', prop: 'align' },
    { id: 'prop-width', prop: 'width', blank: true },
    { id: 'prop-height', prop: 'height', blank: true },
    { id: 'prop-letterSpacing', prop: 'letterSpacing', blank: true },
    { id: 'prop-lineHeight', prop: 'lineHeight', blank: true },
  ];

  // Bind events
  const id = el._id;

  bindInput('prop-name', (v) => Elements.update(id, { name: v }));

  document.getElementById('prop-text').addEventListener('input', (e) => {
    Elements.update(id, { text: e.target.value });
  });
  bindInput('prop-slot', (v) => {
    Elements.update(id, { slot: v.trim() || undefined });
  });
  bindInput('prop-left', (v) => Elements.update(id, { left: parseInt(v) }));
  bindInput('prop-top', (v) => Elements.update(id, { top: parseInt(v) }));

  // Font size: typeable number + preset dropdown (replaces the janky slider).
  const fontSizeInput = document.getElementById('prop-fontSize');
  const fontSizePreset = document.getElementById('prop-fontSize-preset');
  fontSizeInput.addEventListener('input', () => {
    const v = parseInt(fontSizeInput.value);
    if (!isNaN(v)) Elements.update(id, { fontSize: Math.max(8, Math.min(400, v)) });
    if (fontSizePreset !== document.activeElement) fontSizePreset.value = '';
  });
  fontSizePreset.addEventListener('change', () => {
    const v = parseInt(fontSizePreset.value);
    if (!isNaN(v)) {
      fontSizeInput.value = v;
      Elements.update(id, { fontSize: v });
    }
  });

  bindSelect('prop-fontFamily', (v) => Elements.update(id, { fontFamily: v }));
  bindSelect('prop-fontWeight', (v) => Elements.update(id, { fontWeight: v }));
  bindSelect('prop-align', (v) => Elements.update(id, { align: v }));
  bindNumber('prop-width', (v) => Elements.update(id, { width: v }));
  bindNumber('prop-height', (v) => Elements.update(id, { height: v }));
  bindNumber('prop-letterSpacing', (v) => Elements.update(id, { letterSpacing: v }));
  bindNumber('prop-lineHeight', (v) => Elements.update(id, { lineHeight: v }));

  bindSelect('prop-effect', (v) => {
    Elements.update(id, { effect: v });
    const colorGroup = document.getElementById('color-group');
    if (colorGroup) {
      colorGroup.style.opacity = v !== 'none' ? '0.4' : '1';
      colorGroup.style.pointerEvents = v !== 'none' ? 'none' : 'auto';
    }
  });

  bindColorPair('prop-color', 'prop-color-text', (v) => Elements.update(id, { color: v }));

  document.addEventListener('ob:delete', function handler(e) {
    if (e.detail === id) Elements.remove(id);
    document.removeEventListener('ob:delete', handler);
  });
}

function renderRectInspector(el) {
  currentEl = el;
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Rectangle</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Layer</div>
      <div class="form-group">
        <label class="form-label">Layer Name</label>
        <input type="text" class="form-input form-input--sm" id="prop-name" value="${escapeHTML(el.name || '')}" placeholder="Rectangle">
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Position</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">X</label>
          <input type="number" class="form-input form-input--sm" id="prop-left" value="${el.left}">
        </div>
        <div class="form-group">
          <label class="form-label">Y</label>
          <input type="number" class="form-input form-input--sm" id="prop-top" value="${el.top}">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Size</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Width</label>
          <input type="number" class="form-input form-input--sm" id="prop-width" value="${el.width}">
        </div>
        <div class="form-group">
          <label class="form-label">Height</label>
          <input type="number" class="form-input form-input--sm" id="prop-height" value="${el.height}">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Appearance</div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:var(--ob-space-2);align-items:center;">
          <input type="color" class="form-input" id="prop-color" value="${el.color.startsWith('rgba') ? '#000000' : escapeHTML(el.color)}" style="width:40px;">
          <input type="text" class="form-input form-input--sm" id="prop-color-text" value="${escapeHTML(el.color)}" style="flex:1;font-family:var(--ob-font-mono);font-size:var(--ob-text-xs);">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Corner Radius: <span id="radius-val">${el.radius}</span>px</label>
        <input type="range" min="0" max="200" value="${el.radius}" id="prop-radius">
      </div>
    </div>
  `;

  syncSpec = [
    { id: 'prop-name', prop: 'name', blank: true },
    { id: 'prop-left', prop: 'left' },
    { id: 'prop-top', prop: 'top' },
    { id: 'prop-width', prop: 'width' },
    { id: 'prop-height', prop: 'height' },
  ];

  const id = el._id;
  bindInput('prop-name', (v) => Elements.update(id, { name: v }));
  bindInput('prop-left', (v) => Elements.update(id, { left: parseInt(v) }));
  bindInput('prop-top', (v) => Elements.update(id, { top: parseInt(v) }));
  bindInput('prop-width', (v) => Elements.update(id, { width: parseInt(v) }));
  bindInput('prop-height', (v) => Elements.update(id, { height: parseInt(v) }));

  bindColorPair('prop-color', 'prop-color-text', (v) => Elements.update(id, { color: v }));

  const radiusRange = document.getElementById('prop-radius');
  radiusRange.addEventListener('input', () => {
    document.getElementById('radius-val').textContent = radiusRange.value;
    Elements.update(id, { radius: parseInt(radiusRange.value) });
  });

  document.addEventListener('ob:delete', function handler(e) {
    if (e.detail === id) Elements.remove(id);
    document.removeEventListener('ob:delete', handler);
  });
}

function renderImageInspector(el) {
  currentEl = el;
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Image</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Layer</div>
      <div class="form-group">
        <label class="form-label">Layer Name</label>
        <input type="text" class="form-input form-input--sm" id="prop-name" value="${escapeHTML(el.name || '')}" placeholder="Image">
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Source</div>
      <div class="form-group">
        <label class="form-label">Image URL</label>
        <input type="url" class="form-input form-input--sm" id="prop-src" value="${escapeHTML(el.src)}" placeholder="https://...">
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Position</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">X</label>
          <input type="number" class="form-input form-input--sm" id="prop-left" value="${el.left}">
        </div>
        <div class="form-group">
          <label class="form-label">Y</label>
          <input type="number" class="form-input form-input--sm" id="prop-top" value="${el.top}">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Size</div>
      <div class="inspector-grid">
        <div class="form-group">
          <label class="form-label">Width</label>
          <input type="number" class="form-input form-input--sm" id="prop-width" value="${el.width}">
        </div>
        <div class="form-group">
          <label class="form-label">Height</label>
          <input type="number" class="form-input form-input--sm" id="prop-height" value="${el.height}">
        </div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Style</div>
      <div class="form-group">
        <label class="form-label">Corner Radius: <span id="radius-val">${el.radius}</span>px</label>
        <input type="range" min="0" max="200" value="${el.radius}" id="prop-radius">
      </div>
    </div>
  `;

  syncSpec = [
    { id: 'prop-name', prop: 'name', blank: true },
    { id: 'prop-src', prop: 'src' },
    { id: 'prop-left', prop: 'left' },
    { id: 'prop-top', prop: 'top' },
    { id: 'prop-width', prop: 'width' },
    { id: 'prop-height', prop: 'height' },
  ];

  const id = el._id;
  bindInput('prop-name', (v) => Elements.update(id, { name: v }));
  document.getElementById('prop-src').addEventListener('change', (e) => {
    Elements.update(id, { src: e.target.value });
  });
  bindInput('prop-left', (v) => Elements.update(id, { left: parseInt(v) }));
  bindInput('prop-top', (v) => Elements.update(id, { top: parseInt(v) }));
  bindInput('prop-width', (v) => Elements.update(id, { width: parseInt(v) }));
  bindInput('prop-height', (v) => Elements.update(id, { height: parseInt(v) }));

  const radiusRange = document.getElementById('prop-radius');
  radiusRange.addEventListener('input', () => {
    document.getElementById('radius-val').textContent = radiusRange.value;
    Elements.update(id, { radius: parseInt(radiusRange.value) });
  });

  document.addEventListener('ob:delete', function handler(e) {
    if (e.detail === id) Elements.remove(id);
    document.removeEventListener('ob:delete', handler);
  });
}

/* ── Helpers ── */

function bindInput(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => fn(el.value));
}

function bindSelect(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => fn(el.value));
}

/** Number field that accepts blanks (empty → undefined). Fires on change. */
function bindNumber(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    const v = parseFloat(el.value);
    fn(isNaN(v) ? undefined : v);
  });
}

function bindColorPair(colorId, textId, fn) {
  const colorEl = document.getElementById(colorId);
  const textEl = document.getElementById(textId);
  if (!colorEl || !textEl) return;

  colorEl.addEventListener('input', () => {
    textEl.value = colorEl.value;
    fn(colorEl.value);
  });
  textEl.addEventListener('change', () => {
    try {
      colorEl.value = textEl.value;
    } catch { /* custom format like rgba */ }
    fn(textEl.value);
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** The auto slot name a text element would get if it has no explicit slot. */
function autoSlotFor(el) {
  const textEls = Elements.getAll().filter(e => e.type === 'text');
  const idx = textEls.findIndex(e => e._id === el._id);
  return `text${idx >= 0 ? idx + 1 : 1}`;
}
