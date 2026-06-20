import PQueue from 'p-queue';
import { renderImage } from './render.js';
import { config } from './config.js';
import { renderDuration, queueWait, renderErrors } from './metrics.js';

// Single shared render queue — used by both POST /v1/render and the template
// render-by-id route so they share one concurrency/backpressure budget.
const queue = new PQueue({ concurrency: config.renderConcurrency });

export class QueueFullError extends Error {
  constructor() {
    super('render queue is full, retry later');
    this.status = 429;
    this.expose = true;
  }
}

/**
 * Enqueue a fully-validated render document and return the image Buffer.
 * Records queue-wait + render-duration; throws QueueFullError when saturated.
 */
export async function enqueue(doc) {
  if (queue.size + queue.pending >= config.renderQueueMax) {
    renderErrors.inc({ reason: 'queue_full' });
    throw new QueueFullError();
  }
  const enqueued = process.hrtime.bigint();
  return queue.add(async () => {
    queueWait.observe(Number(process.hrtime.bigint() - enqueued) / 1e9);
    const stop = renderDuration.startTimer();
    try {
      return await renderImage(doc);
    } finally {
      stop();
    }
  });
}
