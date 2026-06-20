import { Router } from 'express';
import { isReady } from '../browser-pool.js';
import { registry } from '../metrics.js';

export const healthRouter = Router();

healthRouter.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

healthRouter.get('/readyz', (_req, res) => {
  if (isReady()) return res.json({ status: 'ready' });
  return res.status(503).json({ status: 'not-ready' });
});

healthRouter.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
