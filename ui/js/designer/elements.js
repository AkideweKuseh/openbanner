/* ═══════════════════════════════════════════════════════════
   OpenBanner — Elements Model
   ═══════════════════════════════════════════════════════════ */

import { history } from './history.js';

let nextId = 1;
let elements = [];
let selectedId = null;
let listeners = [];
let selectListeners = [];

function notify() {
  for (const fn of listeners) fn(getAll(), selectedId);
}

/** Fire only when the selected element actually changes (not on every property edit). */
function notifySelect() {
  for (const fn of selectListeners) fn(selectedId);
}

function snapshot() {
  history.push({ elements: JSON.parse(JSON.stringify(elements)), selectedId });
}

export function onChange(fn) {
  listeners.push(fn);
}

/** Subscribe to selection changes only (used to rebuild the inspector; safe for focus). */
export function onSelectChange(fn) {
  selectListeners.push(fn);
}

export function getAll() {
  return elements;
}

export function getById(id) {
  return elements.find(el => el._id === id) || null;
}

export function getSelected() {
  return selectedId ? getById(selectedId) : null;
}

export function getSelectedId() {
  return selectedId;
}

export function select(id) {
  if (selectedId === id) { notify(); return; }
  selectedId = id;
  notify();
  notifySelect();
}

export function deselect() {
  if (selectedId === null) { notify(); return; }
  selectedId = null;
  notify();
  notifySelect();
}

/** Create a default text element */
export function addText(overrides = {}) {
  snapshot();
  const el = {
    _id: nextId++,
    type: 'text',
    name: '',
    text: 'Your Text Here',
    left: 80,
    top: 80 + elements.length * 50,
    fontFamily: 'Inter',
    fontSize: 48,
    color: '#ffffff',
    fontWeight: 'bold',
    effect: 'none',
    align: 'left',
    // Optional sized "placeholder" box. Blank = auto-grow (legacy behavior).
    width: undefined,
    height: undefined,
    letterSpacing: undefined,
    lineHeight: undefined,
    ...overrides,
  };
  elements.push(el);
  selectedId = el._id;
  notify();
  notifySelect();
  return el;
}

/** Create a default rectangle element */
export function addRect(overrides = {}) {
  snapshot();
  const el = {
    _id: nextId++,
    type: 'rect',
    name: '',
    left: 60,
    top: 60 + elements.length * 30,
    width: 300,
    height: 100,
    color: 'rgba(0,0,0,0.5)',
    radius: 12,
    ...overrides,
  };
  elements.push(el);
  selectedId = el._id;
  notify();
  notifySelect();
  return el;
}

/** Create a default image element */
export function addImage(overrides = {}) {
  snapshot();
  const el = {
    _id: nextId++,
    type: 'image',
    name: '',
    src: overrides.src || 'https://placehold.co/400x300/e2e8f0/475569?text=Double-Click+to+Upload',
    left: 60,
    top: 60 + elements.length * 30,
    width: 400,
    height: 300,
    radius: 0,
    ...overrides,
  };
  elements.push(el);
  selectedId = el._id;
  notify();
  notifySelect();
  return el;
}

/** Update an element's properties */
export function update(id, props) {
  snapshot();
  const el = getById(id);
  if (!el) return;
  Object.assign(el, props);
  notify();
}

/** Move an element (no snapshot for smooth dragging — call snapshotMove when done) */
export function move(id, left, top) {
  const el = getById(id);
  if (!el) return;
  el.left = Math.round(left);
  el.top = Math.round(top);
  notify();
}

/** Resize an element (no snapshot during drag) */
export function resize(id, props) {
  const el = getById(id);
  if (!el) return;
  if (props.left !== undefined) el.left = Math.round(props.left);
  if (props.top !== undefined) el.top = Math.round(props.top);
  if (props.width !== undefined) el.width = Math.max(10, Math.round(props.width));
  if (props.height !== undefined) el.height = Math.max(10, Math.round(props.height));
  if (props.fontSize !== undefined) el.fontSize = Math.max(8, Math.round(props.fontSize));
  notify();
}

/** Take a snapshot for undo after drag/resize completes */
export function commitDrag() {
  snapshot();
}

/** Delete an element */
export function remove(id) {
  snapshot();
  elements = elements.filter(el => el._id !== id);
  const wasSelected = selectedId === id;
  if (wasSelected) selectedId = null;
  notify();
  if (wasSelected) notifySelect();
}

/** Duplicate the selected element */
export function duplicate(id) {
  const el = getById(id);
  if (!el) return null;
  snapshot();
  const copy = { ...JSON.parse(JSON.stringify(el)), _id: nextId++ };
  copy.left += 20;
  copy.top += 20;
  elements.push(copy);
  selectedId = copy._id;
  notify();
  notifySelect();
  return copy;
}

/** Move element up in the layer order */
export function moveUp(id) {
  const idx = elements.findIndex(el => el._id === id);
  if (idx < elements.length - 1) {
    snapshot();
    [elements[idx], elements[idx + 1]] = [elements[idx + 1], elements[idx]];
    notify();
  }
}

/** Move element down in the layer order */
export function moveDown(id) {
  const idx = elements.findIndex(el => el._id === id);
  if (idx > 0) {
    snapshot();
    [elements[idx], elements[idx - 1]] = [elements[idx - 1], elements[idx]];
    notify();
  }
}

/**
 * Drag-to-reorder. `place` is relative to `targetId` in PANEL order (front-to-back, i.e.
 * the order the Layers list is displayed): 'before' = drop above the target, 'after' =
 * drop below it. We do the move in panel order so "up in the list = closer to front"
 * maps intuitively, then reverse back to the array's back-to-front convention.
 */
export function reorder(draggedId, targetId, place) {
  if (draggedId === targetId) return;
  const dragged = getById(draggedId);
  const target = getById(targetId);
  if (!dragged || !target) return;
  snapshot();
  const panel = [...elements].reverse(); // front-to-back
  const fromP = panel.findIndex(e => e._id === draggedId);
  if (fromP >= 0) panel.splice(fromP, 1);
  let insertAt = panel.findIndex(e => e._id === targetId);
  if (insertAt < 0) {
    // Target vanished (shouldn't happen) — append to end safely.
    insertAt = panel.length;
  } else if (place === 'after') {
    insertAt += 1;
  }
  panel.splice(insertAt, 0, dragged);
  elements = panel.reverse(); // back to back-to-front
  notify();
}

/** Replace all elements (used by undo/redo, import, templates) */
export function replaceAll(newElements, newSelectedId = null) {
  elements = JSON.parse(JSON.stringify(newElements));
  // Ensure _id continuity
  let maxId = 0;
  for (const el of elements) {
    if (!el._id) el._id = nextId++;
    if (el._id >= maxId) maxId = el._id + 1;
  }
  nextId = Math.max(nextId, maxId);
  const prevSelected = selectedId;
  selectedId = newSelectedId;
  notify();
  if (prevSelected !== selectedId) notifySelect();
}

/** Build the API render payload (strips _id) */
export function toRenderPayload(canvasState) {
  return {
    width: canvasState.width,
    height: canvasState.height,
    backgroundColor: canvasState.backgroundColor,
    format: canvasState.format || 'png',
    quality: canvasState.quality || 90,
    deviceScaleFactor: canvasState.deviceScaleFactor || 1,
    elements: elements.map(el => {
      const { _id, ...rest } = el;
      return rest;
    }),
  };
}

/** Import from render payload JSON */
export function importFromJSON(json) {
  snapshot();
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.elements && Array.isArray(data.elements)) {
    elements = data.elements.map(el => ({ ...el, _id: nextId++ }));
  }
  selectedId = null;
  notify();
  return data;
}

export function clear() {
  snapshot();
  elements = [];
  selectedId = null;
  notify();
}
