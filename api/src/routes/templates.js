import { Router } from 'express';
import { templateSchema, renderTemplateSchema, renderSchema, slotsOf } from '../schema.js';
import * as store from '../template-store.js';
import { enqueue } from '../render-queue.js';
import { templateOps } from '../metrics.js';

export const templatesRouter = Router();

/**
 * Assign `text{n}` to slot-less text elements so EVERY text element is a fillable
 * slot (matching the caller's "text1 / text2" mental model). Explicit `slot` wins.
 */
function resolveSlots(def) {
  let auto = 0;
  const elements = (def.elements || []).map((el) => {
    if (el.type !== 'text') return el;
    auto += 1;
    return el.slot ? el : { ...el, slot: `text${auto}` };
  });
  return { ...def, elements };
}

function publicView(doc) {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    slots: doc.slots?.length ? doc.slots : slotsOf(doc.elements || []),
    elements: doc.elements || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function sendError(res, status, message, details) {
  return res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

// POST /  create
templatesRouter.post('/', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, 400, 'invalid template', parsed.error.issues);
  const resolved = resolveSlots(parsed.data);
  try {
    const doc = await store.create({ ...resolved, slots: slotsOf(resolved.elements) });
    templateOps.inc({ op: 'create' });
    return res.status(201).json(publicView(doc));
  } catch (err) {
    return sendError(res, err.status || 500, err.expose ? err.message : 'create failed');
  }
});

// GET /  list (summaries)
templatesRouter.get('/', async (_req, res) => {
  const docs = await store.list();
  return res.json(docs.map(publicView));
});

// GET /:id
templatesRouter.get('/:id', async (req, res) => {
  const doc = await store.get(req.params.id);
  if (!doc) return sendError(res, 404, 'template not found');
  return res.json(publicView(doc));
});

// PUT /:id  update (layout/slots); id is immutable
templatesRouter.put('/:id', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, 400, 'invalid template', parsed.error.issues);
  const resolved = resolveSlots(parsed.data);
  const doc = await store.update(req.params.id, { ...resolved, slots: slotsOf(resolved.elements) });
  if (!doc) return sendError(res, 404, 'template not found');
  templateOps.inc({ op: 'update' });
  return res.json(publicView(doc));
});

// DELETE /:id
templatesRouter.delete('/:id', async (req, res) => {
  const removed = await store.remove(req.params.id);
  if (!removed) return sendError(res, 404, 'template not found');
  templateOps.inc({ op: 'delete' });
  return res.json({ ok: true });
});

// POST /:id/render  inject mergeVars into slots, apply format, return the image
templatesRouter.post('/:id/render', async (req, res) => {
  const doc = await store.get(req.params.id);
  if (!doc) return sendError(res, 404, 'template not found');

  const parsed = renderTemplateSchema.safeParse(req.body || {});
  if (!parsed.success) return sendError(res, 400, 'invalid render request', parsed.error.issues);
  const { format, quality, deviceScaleFactor, mergeVars } = parsed.data;

  const elements = (doc.elements || []).map((el) => {
    if (el.type === 'text' && el.slot && Object.prototype.hasOwnProperty.call(mergeVars, el.slot)) {
      return { ...el, text: mergeVars[el.slot] };
    }
    return el;
  });

  const validated = renderSchema.safeParse({
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    format, quality, deviceScaleFactor, elements,
  });
  if (!validated.success) return sendError(res, 400, 'invalid merged document', validated.error.issues);

  try {
    const buf = await enqueue(validated.data);
    templateOps.inc({ op: 'render' });
    res.set('Content-Type', `image/${format}`);
    res.set('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (err) {
    const status = err.name === 'TimeoutError' ? 504 : (err.status || 500);
    req.log?.error({ err, id: req.params.id }, 'template render failed');
    return res.status(status).json({ error: err.expose ? err.message : 'render failed' });
  }
});
