/* ═══════════════════════════════════════════════════════════
   OpenBanner — Canvas Rendering & Interaction
   ═══════════════════════════════════════════════════════════ */

import * as Elements from './elements.js';
import { api } from '../api.js';

let canvasState = {
  width: 1200,
  height: 630,
  backgroundColor: '#ffffff',
  format: 'png',
  quality: 90,
  deviceScaleFactor: 1,
};

let zoom = 1;
let panX = 0;
let panY = 0;
let isDraggingElement = false;
let dragStartX = 0;
let dragStartY = 0;
let dragElStartLeft = 0;
let dragElStartTop = 0;
let dragElementId = null;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

// Manual double-click tracking (selection re-renders nodes, which would
// otherwise swallow the native dblclick — used to replace an image on dbl-click)
let lastClickTime = 0;
let lastClickId = null;

// Resize state
let isResizing = false;
let resizeHandle = '';
let resizeStartX = 0;
let resizeStartY = 0;
let resizeElStart = {};

let viewport, wrapper, frame;

export function getCanvasState() { return { ...canvasState }; }

export function setCanvasSize(w, h) {
  canvasState.width = w;
  canvasState.height = h;
  updateCanvasFrame();
  fitToViewport();
  document.getElementById('canvas-size-display').textContent = `${w} × ${h}`;
}

export function setCanvasBackground(color) {
  canvasState.backgroundColor = color;
  updateCanvasFrame();
}

export function setExportSettings(settings) {
  Object.assign(canvasState, settings);
}

export function getZoom() { return zoom; }

export function init() {
  viewport = document.getElementById('canvas-viewport');
  wrapper = document.getElementById('canvas-wrapper');
  frame = document.getElementById('canvas-frame');

  updateCanvasFrame();
  fitToViewport();

  // Subscribe to element changes
  Elements.onChange((elements, selectedId) => {
    renderElements(elements, selectedId);
  });

  // Viewport events
  viewport.addEventListener('mousedown', onViewportMouseDown);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('dragover', onDragOver);
  viewport.addEventListener('drop', onDrop);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', positionActions);

  // Initial render
  renderElements(Elements.getAll(), Elements.getSelectedId());
}

function updateCanvasFrame() {
  frame.style.width = canvasState.width + 'px';
  frame.style.height = canvasState.height + 'px';
  frame.style.background = canvasState.backgroundColor;
}

export function fitToViewport() {
  if (!viewport) return;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const padding = 80;

  const scaleX = (vw - padding * 2) / canvasState.width;
  const scaleY = (vh - padding * 2) / canvasState.height;
  zoom = Math.min(scaleX, scaleY, 1);

  panX = (vw - canvasState.width * zoom) / 2;
  panY = (vh - canvasState.height * zoom) / 2;

  applyTransform();
  updateZoomDisplay();
}

function applyTransform() {
  wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateZoomDisplay() {
  document.getElementById('zoom-display').textContent = Math.round(zoom * 100) + '%';
}

export function zoomIn() {
  setZoom(zoom * 1.2);
}

export function zoomOut() {
  setZoom(zoom / 1.2);
}

function setZoom(newZoom, centerX, centerY) {
  const old = zoom;
  zoom = Math.max(0.1, Math.min(5, newZoom));

  if (centerX !== undefined && centerY !== undefined) {
    panX = centerX - (centerX - panX) * (zoom / old);
    panY = centerY - (centerY - panY) * (zoom / old);
  }

  applyTransform();
  updateZoomDisplay();
  positionActions();
}

/* ── Event Handlers ── */

function onViewportMouseDown(e) {
  // Let clicks on action buttons pass through
  if (e.target.closest('.canvas-actions')) {
    return;
  }

  // Check if click was on a canvas element
  const elNode = e.target.closest('.canvas-element');
  const handleNode = e.target.closest('.resize-handle');

  if (handleNode) {
    // Start resize
    e.preventDefault();
    e.stopPropagation();
    const dir = handleNode.dataset.dir;
    const id = parseInt(handleNode.closest('.canvas-element').dataset.id);
    const el = Elements.getById(id);
    if (!el) return;

    isResizing = true;
    resizeHandle = dir;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeElStart = { left: el.left, top: el.top, width: el.width || 100, height: el.height || 50, fontSize: el.fontSize };
    return;
  }

  if (elNode) {
    // Start element drag
    e.preventDefault();
    const id = parseInt(elNode.dataset.id);

    // Double-click to replace an image (manual detection — see lastClick* vars)
    const now = Date.now();
    const peek = Elements.getById(id);
    if (id === lastClickId && (now - lastClickTime) < 400 && peek && peek.type === 'image') {
      lastClickTime = 0;
      lastClickId = null;
      triggerImageUpload(undefined, undefined, id);
      return;
    }
    lastClickTime = now;
    lastClickId = id;

    Elements.select(id);
    const el = Elements.getById(id);
    if (!el) return;

    isDraggingElement = true;
    dragElementId = id;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragElStartLeft = el.left;
    dragElStartTop = el.top;
    viewport.style.cursor = 'move';
    return;
  }

  // Click on empty canvas area — deselect & start pan
  Elements.deselect();

  // Check if click was on the canvas frame itself (to show canvas properties)
  const frameClicked = e.target.closest('#canvas-frame');
  if (frameClicked) {
    // Show canvas properties in inspector
    if (typeof window._showCanvasProperties === 'function') {
      window._showCanvasProperties();
    }
  }

  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartPanX = panX;
  panStartPanY = panY;
  viewport.style.cursor = 'grabbing';
}

function onMouseMove(e) {
  if (isDraggingElement && dragElementId !== null) {
    const dx = (e.clientX - dragStartX) / zoom;
    const dy = (e.clientY - dragStartY) / zoom;
    Elements.move(dragElementId, dragElStartLeft + dx, dragElStartTop + dy);
    return;
  }

  if (isResizing) {
    const dx = (e.clientX - resizeStartX) / zoom;
    const dy = (e.clientY - resizeStartY) / zoom;
    const el = Elements.getSelected();
    if (!el) return;

    const props = {};

    if (el.type === 'text') {
      // For text, resize = change fontSize
      if (resizeHandle.includes('s') || resizeHandle.includes('n')) {
        const newSize = resizeElStart.fontSize + (resizeHandle.includes('n') ? -dy : dy);
        props.fontSize = Math.max(8, Math.min(400, Math.round(newSize)));
      }
      if (resizeHandle.includes('n')) {
        props.top = resizeElStart.top + dy;
      }
    } else {
      // For rect/image, resize dimensions
      if (resizeHandle.includes('e')) {
        props.width = resizeElStart.width + dx;
      }
      if (resizeHandle.includes('w')) {
        props.width = resizeElStart.width - dx;
        props.left = resizeElStart.left + dx;
      }
      if (resizeHandle.includes('s')) {
        props.height = resizeElStart.height + dy;
      }
      if (resizeHandle.includes('n')) {
        props.height = resizeElStart.height - dy;
        props.top = resizeElStart.top + dy;
      }
    }

    Elements.resize(el._id, props);
    return;
  }

  if (isPanning) {
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
    applyTransform();
    positionActions();
  }
}

function onMouseUp() {
  if (isDraggingElement) {
    Elements.commitDrag();
    isDraggingElement = false;
    dragElementId = null;
    viewport.style.cursor = 'grab';
  }
  if (isResizing) {
    Elements.commitDrag();
    isResizing = false;
    viewport.style.cursor = 'grab';
  }
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = 'grab';
  }
}

function onWheel(e) {
  e.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  
  // Use a continuous scale factor based on scroll amount for smooth zooming
  const zoomIntensity = 0.0015;
  const factor = Math.exp(-e.deltaY * zoomIntensity);
  
  setZoom(zoom * factor, cx, cy);
}

function onDragOver(e) {
  e.preventDefault(); // Necessary to allow dropping
  e.dataTransfer.dropEffect = 'copy';
}

function onDrop(e) {
  e.preventDefault();

  const rect = wrapper.getBoundingClientRect();
  const dropX = (e.clientX - rect.left) / zoom;
  const dropY = (e.clientY - rect.top) / zoom;

  // Handle actual file drops
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith('image/')) {
      fileToImageSrc(file).then((src) => Elements.addImage({ left: dropX, top: dropY, src }));
    }
    return;
  }

  const type = e.dataTransfer.getData('application/ob-element-type');
  if (!type) return;

  if (type === 'text') Elements.addText({ left: dropX, top: dropY });
  if (type === 'rect') Elements.addRect({ left: dropX, top: dropY });
  if (type === 'image') Elements.addImage({ left: dropX, top: dropY });
}

export function triggerImageUpload(dropX, dropY, existingId = null) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    fileToImageSrc(file).then((src) => {
      if (existingId) {
        Elements.update(existingId, { src });
      } else {
        const payload = { src };
        if (dropX !== undefined) payload.left = dropX;
        if (dropY !== undefined) payload.top = dropY;
        Elements.addImage(payload);
      }
    });
  };
  input.click();
}

/**
 * Resolve a dropped/selected image file to a storable `src`: when the API is configured,
 * upload it to object storage and return an `ob-image:<key>` reference (keeps templates
 * small); otherwise (or if the upload fails) fall back to an inline data: URI so the
 * designer keeps working offline.
 */
async function fileToImageSrc(file) {
  if (api.isConfigured) {
    try {
      const { ref } = await api.uploadImage(file);
      return ref;
    } catch (err) {
      console.warn('Image upload to storage failed; using inline data URI instead:', err);
    }
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function onKeyDown(e) {
  // Don't intercept if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const sel = Elements.getSelectedId();
    if (sel) { e.preventDefault(); Elements.remove(sel); }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    const state = (await_import_history()).undo();
    if (state) Elements.replaceAll(state.elements, state.selectedId);
  }

  if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    e.preventDefault();
    const state = (await_import_history()).redo();
    if (state) Elements.replaceAll(state.elements, state.selectedId);
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    const sel = Elements.getSelectedId();
    if (sel) Elements.duplicate(sel);
  }
}

// Lazy import helper for history (avoids circular import)
let _historyModule = null;
function await_import_history() {
  if (!_historyModule) {
    // history is imported synchronously since it's already loaded
    _historyModule = { undo: () => null, redo: () => null };
    import('./history.js').then(m => { _historyModule = m.history; });
  }
  return _historyModule;
}

// Eagerly load history
import('./history.js').then(m => { _historyModule = m.history; });

/* ── Render Elements to DOM ── */

function renderElements(elements, selectedId) {
  const actionsEl = document.getElementById('canvas-actions');
  // Keep the floating action bar in the canvas-area (NOT inside the clipped canvas-frame)
  // so it never gets cut off when an element sits near an edge.
  const area = document.querySelector('.designer__canvas-area');
  if (actionsEl && area && actionsEl.parentElement !== area) {
    area.appendChild(actionsEl);
  }

  // Preserve frame reference but clear element children
  const existing = frame.querySelectorAll('.canvas-element');
  existing.forEach(node => node.remove());

  for (const el of elements) {
    const node = createElementNode(el, el._id === selectedId);
    frame.appendChild(node);
  }

  // Show/hide and position the floating action bar based on selection
  if (actionsEl) {
    if (selectedId) {
      actionsEl.style.display = 'flex';
      // The "Replace image" button only makes sense for image elements
      const selEl = Elements.getById(selectedId);
      const replaceBtn = document.getElementById('btn-replace-image');
      if (replaceBtn) replaceBtn.style.display = (selEl && selEl.type === 'image') ? 'inline-flex' : 'none';
      positionActions();
    } else {
      actionsEl.style.display = 'none';
    }
  }

  // Update layers panel
  renderLayers(elements, selectedId);
}

/**
 * Position the floating duplicate/delete bar relative to the selected element.
 * Lives in .designer__canvas-area so it is never clipped by the canvas-frame's
 * overflow:hidden. Flips below the element when there's no room above.
 */
function positionActions() {
  const actionsEl = document.getElementById('canvas-actions');
  const area = document.querySelector('.designer__canvas-area');
  const sel = frame.querySelector('.canvas-element--selected');
  if (!actionsEl || !area || !sel) return;
  if (actionsEl.style.display === 'none') return;

  const selRect = sel.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  const barW = actionsEl.offsetWidth;
  const barH = actionsEl.offsetHeight || 44;

  let top = selRect.top - areaRect.top - barH - 8;
  // Not enough room above (or over the top bar) → flip below the element
  if (top < 8) top = selRect.bottom - areaRect.top + 8;

  let left = selRect.right - areaRect.left - barW;
  if (left < 8) left = 8;
  const maxLeft = areaRect.width - barW - 8;
  if (left > maxLeft) left = maxLeft;

  actionsEl.style.top = top + 'px';
  actionsEl.style.left = left + 'px';
}

function createElementNode(el, isSelected) {
  const div = document.createElement('div');
  div.className = 'canvas-element' + (isSelected ? ' canvas-element--selected' : '');
  div.dataset.id = el._id;

  if (el.type === 'text') {
    // Mirror the server's alignment anchoring (api/src/render.js) so the canvas preview
    // matches the rendered output exactly: center/right pull the box back via translateX.
    const align = el.align || 'left';
    const transform = align === 'center' ? 'translateX(-50%)'
      : align === 'right' ? 'translateX(-100%)' : '';
    div.style.cssText = `
      position: absolute;
      left: ${el.left}px; top: ${el.top}px;
      font-size: ${el.fontSize}px;
      font-family: "${el.fontFamily || 'Inter'}", sans-serif;
      font-weight: ${el.fontWeight};
      ${el.maxWidth ? `max-width: ${el.maxWidth}px;` : ''}
      text-align: ${align};
      ${transform ? `transform: ${transform};` : ''}
      ${getTextEffectCSS(el)}
      cursor: move;
      user-select: none;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    div.textContent = el.text;

    // Text resize handles (top/bottom only for font size)
    if (isSelected) {
      div.innerHTML += createResizeHandles(true);
    }
  } else if (el.type === 'rect') {
    div.style.cssText = `
      position: absolute;
      left: ${el.left}px; top: ${el.top}px;
      width: ${el.width}px; height: ${el.height}px;
      background: ${el.color};
      border-radius: ${el.radius}px;
      cursor: move;
    `;
    if (isSelected) {
      div.innerHTML = createResizeHandles(false);
    }
  } else if (el.type === 'image') {
    div.style.cssText = `
      position: absolute;
      left: ${el.left}px; top: ${el.top}px;
      width: ${el.width}px; height: ${el.height}px;
      cursor: move;
    `;

    const imgWrapper = document.createElement('div');
    imgWrapper.style.cssText = `width:100%;height:100%;overflow:hidden;border-radius:${el.radius}px;pointer-events:auto;`;

    const img = document.createElement('img');
    img.src = api.imageUrl(el.src);
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;cursor:pointer;';
    img.ondblclick = () => {
      triggerImageUpload(undefined, undefined, el._id);
    };
    img.onerror = () => {
      img.style.display = 'none';
      imgWrapper.style.background = 'repeating-linear-gradient(45deg, #2a2a3a, #2a2a3a 10px, #1a1a2a 10px, #1a1a2a 20px)';
      div.title = 'Image failed to load';
    };
    imgWrapper.appendChild(img);
    div.appendChild(imgWrapper);

    if (isSelected) {
      div.insertAdjacentHTML('beforeend', createResizeHandles(false));
    }
  }

  return div;
}

function getTextEffectCSS(el) {
  if (el.effect === 'gradient') {
    return 'background: linear-gradient(45deg, #ff007f, #7f00ff); -webkit-background-clip: text; background-clip: text; color: transparent;';
  } else if (el.effect === 'neon') {
    return 'color: #fff; text-shadow: 0 0 5px #fff, 0 0 10px #ff007f, 0 0 20px #ff007f;';
  }
  return `color: ${el.color};`;
}

function createResizeHandles(isText) {
  const dirs = isText
    ? ['n', 's']
    : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return '<div class="resize-handles">' +
    dirs.map(d => `<div class="resize-handle resize-handle--${d}" data-dir="${d}"></div>`).join('') +
    '</div>';
}

/* ── Layers Panel ── */

function renderLayers(elements, selectedId) {
  const list = document.getElementById('layers-list');
  const count = document.getElementById('layer-count');
  if (!list || !count) return;

  count.textContent = elements.length;
  list.innerHTML = '';

  // Reverse order (top layer first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    const isSelected = el._id === selectedId;
    const icons = {
      text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>',
      rect: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"></rect></svg>',
      image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'
    };
    const label = el.type === 'text'
      ? (el.text.substring(0, 18) + (el.text.length > 18 ? '…' : ''))
      : (el.type.charAt(0).toUpperCase() + el.type.slice(1));

    const div = document.createElement('div');
    div.className = 'layer-item' + (isSelected ? ' layer-item--selected' : '');
    div.innerHTML = `
      <span class="layer-item__icon">${icons[el.type] || icons.rect}</span>
      <span class="layer-item__name">${escapeHTML(label)}</span>
      <div class="layer-item__actions">
        <button class="layer-action-btn" data-action="up" title="Move Up" aria-label="Move layer up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
        <button class="layer-action-btn" data-action="down" title="Move Down" aria-label="Move layer down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <button class="layer-action-btn" data-action="delete" title="Delete" aria-label="Delete layer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
    `;

    div.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (action) {
        e.stopPropagation();
        if (action.dataset.action === 'up') Elements.moveUp(el._id);
        else if (action.dataset.action === 'down') Elements.moveDown(el._id);
        else if (action.dataset.action === 'delete') Elements.remove(el._id);
        return;
      }
      Elements.select(el._id);
    });

    list.appendChild(div);
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
