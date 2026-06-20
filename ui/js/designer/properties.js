/* ═══════════════════════════════════════════════════════════
   OpenBanner — Property Inspector
   ═══════════════════════════════════════════════════════════ */

import * as Elements from './elements.js';
import * as Canvas from './canvas.js';

let inspectorContent, inspectorEmpty;

export function init() {
  inspectorContent = document.getElementById('inspector-content');
  inspectorEmpty = document.getElementById('inspector-empty');

  // Listen for element selection changes
  Elements.onChange((elements, selectedId) => {
    if (selectedId) {
      const el = Elements.getById(selectedId);
      if (el) showElementProperties(el);
    } else {
      showEmpty();
    }
  });

  // Canvas background click handler
  window._showCanvasProperties = () => {
    showCanvasProperties();
  };
}

function showEmpty() {
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
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Text Element</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
      <div class="form-group" style="margin-bottom:var(--ob-space-2);">
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
      <div class="form-group" style="margin-bottom:var(--ob-space-2);">
        <label class="form-label">Font Size: <span id="font-size-val">${el.fontSize}</span>px</label>
        <input type="range" min="8" max="400" value="${el.fontSize}" id="prop-fontSize">
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
          <label class="form-label">Max Width</label>
          <input type="number" class="form-input form-input--sm" id="prop-maxWidth" value="${el.maxWidth || ''}" placeholder="auto">
        </div>
      </div>
      <div class="form-group" style="margin-top:var(--ob-space-2);">
        <label class="form-label">Alignment</label>
        <select class="form-input form-input--sm" id="prop-align">
          <option value="left" ${(!el.align || el.align === 'left') ? 'selected' : ''}>Left (grow right)</option>
          <option value="center" ${el.align === 'center' ? 'selected' : ''}>Center (on X)</option>
          <option value="right" ${el.align === 'right' ? 'selected' : ''}>Right (end at X)</option>
        </select>
        <div style="font-size:var(--ob-text-xs);color:var(--ob-text-muted);margin-top:4px;">Center/right keep text anchored as its length changes — set X to the anchor point (e.g. canvas center).</div>
      </div>
    </div>
    <div class="inspector__section">
      <div class="inspector__section-title">Appearance</div>
      <div class="form-group" style="margin-bottom:var(--ob-space-2);">
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
          <input type="color" class="form-input" id="prop-color" value="${el.color}" style="width:40px;">
          <input type="text" class="form-input form-input--sm" id="prop-color-text" value="${el.color}" style="flex:1;font-family:var(--ob-font-mono);font-size:var(--ob-text-xs);">
        </div>
      </div>
    </div>
  `;

  // Bind events
  const id = el._id;

  document.getElementById('prop-text').addEventListener('input', (e) => {
    Elements.update(id, { text: e.target.value });
  });
  bindInput('prop-slot', (v) => {
    Elements.update(id, { slot: v.trim() || undefined });
  });
  bindInput('prop-left', (v) => Elements.update(id, { left: parseInt(v) }));
  bindInput('prop-top', (v) => Elements.update(id, { top: parseInt(v) }));

  const fontSizeRange = document.getElementById('prop-fontSize');
  fontSizeRange.addEventListener('input', () => {
    document.getElementById('font-size-val').textContent = fontSizeRange.value;
    Elements.update(id, { fontSize: parseInt(fontSizeRange.value) });
  });

  bindSelect('prop-fontFamily', (v) => Elements.update(id, { fontFamily: v }));
  bindSelect('prop-fontWeight', (v) => Elements.update(id, { fontWeight: v }));
  bindSelect('prop-align', (v) => Elements.update(id, { align: v }));
  bindInput('prop-maxWidth', (v) => {
    const parsed = parseInt(v);
    Elements.update(id, { maxWidth: isNaN(parsed) ? undefined : parsed });
  });

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
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Rectangle</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
      <div class="form-group" style="margin-bottom:var(--ob-space-2);">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:var(--ob-space-2);align-items:center;">
          <input type="color" class="form-input" id="prop-color" value="${el.color.startsWith('rgba') ? '#000000' : el.color}" style="width:40px;">
          <input type="text" class="form-input form-input--sm" id="prop-color-text" value="${el.color}" style="flex:1;font-family:var(--ob-font-mono);font-size:var(--ob-text-xs);">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Corner Radius: <span id="radius-val">${el.radius}</span>px</label>
        <input type="range" min="0" max="200" value="${el.radius}" id="prop-radius">
      </div>
    </div>
  `;

  const id = el._id;
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
  inspectorContent.innerHTML = `
    <div class="inspector__header">
      <span class="inspector__title">Image</span>
      <button class="btn btn--ghost btn--sm" title="Delete element" aria-label="Delete element" onclick="document.dispatchEvent(new CustomEvent('ob:delete', {detail:${el._id}}))"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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

  const id = el._id;
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
