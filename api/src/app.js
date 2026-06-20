import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { config } from './config.js';
import { requireApiKey } from './auth.js';
import { corsMiddleware } from './cors.js';
import { renderRouter } from './routes/render.js';
import { templatesRouter } from './routes/templates.js';
import { imagesRouter } from './routes/images.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind nginx

  app.use(pinoHttp({ logger }));
  app.use(helmet());

  // CORS (env-gated) — must run before the API-key gate so OPTIONS preflight passes.
  app.use(corsMiddleware);

  // Health & metrics (metrics is blocked from the internet at the nginx layer).
  app.use('/', healthRouter);

  const limiter = rateLimit({
    windowMs: config.rateWindowMs,
    max: config.rateMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Shared gate for JSON /v1 routes: rate limit + API-key auth + JSON body parser.
  const v1Gate = [limiter, requireApiKey, express.json({ limit: config.bodyLimit })];

  // Images: raw-body uploads (POST, authenticated) + PUBLIC reads (GET). Mounted
  // before the JSON gate because the body is binary, not JSON, and GET must skip auth
  // so the designer's <img> tags can load uploads. The router enforces its own auth.
  app.use('/v1/images', limiter, imagesRouter);

  // Register the more specific /v1/templates BEFORE the broad /v1 so template
  // requests don't pass through the /v1 gate twice. templatesRouter always sends a
  // response (no fall-through), so /v1 never runs for those paths.
  app.use('/v1/templates', ...v1Gate, templatesRouter);
  app.use('/v1', ...v1Gate, renderRouter);

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Centralized error handler (maps body-parser errors to proper codes).
  app.use((err, req, res, _next) => {
    req.log?.error({ err }, 'unhandled error');
    if (res.headersSent) return;
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
