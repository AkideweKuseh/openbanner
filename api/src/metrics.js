import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const renderDuration = new client.Histogram({
  name: 'render_duration_seconds',
  help: 'Render time in seconds',
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});
export const queueWait = new client.Histogram({
  name: 'render_queue_wait_seconds',
  help: 'Time spent waiting in the render queue',
  buckets: [0.01, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});
export const renderErrors = new client.Counter({
  name: 'render_errors_total',
  help: 'Render errors by reason',
  labelNames: ['reason'],
  registers: [registry],
});
export const templateOps = new client.Counter({
  name: 'template_ops_total',
  help: 'Template operations by type (create/update/delete/render)',
  labelNames: ['op'],
  registers: [registry],
});
