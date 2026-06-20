import { Router } from 'express';
import { renderSchema } from '../schema.js';
import { enqueue } from '../render-queue.js';
import { renderErrors } from '../metrics.js';

export const renderRouter = Router();

renderRouter.post('/render', async (req, res) => {
  const parsed = renderSchema.safeParse(req.body);
  if (!parsed.success) {
    renderErrors.inc({ reason: 'validation' });
    return res.status(400).json({ error: 'invalid request', details: parsed.error.issues });
  }
  const doc = parsed.data;

  try {
    const buf = await enqueue(doc);
    res.set('Content-Type', `image/${doc.format}`);
    res.set('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (err) {
    const status = err.name === 'TimeoutError' ? 504 : (err.status || 500);
    renderErrors.inc({ reason: status === 504 ? 'timeout' : (status === 429 ? 'queue_full' : 'render') });
    req.log?.error({ err }, 'render failed');
    return res.status(status).json({ error: err.expose ? err.message : 'render failed' });
  }
});
