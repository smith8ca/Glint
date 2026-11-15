import express, { ErrorRequestHandler, Express, Request } from 'express';
import { STATUS_CODES } from 'node:http';
import { Config } from './config';
import { logger } from './logger';
import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';
import { describeError } from './utils/errors';

/** Status of a client error raised by the body parser (malformed JSON, body too large, …). */
function clientErrorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/**
 * Replaces Express's default error page, which is HTML and, unless NODE_ENV is
 * `production`, includes the stack trace and file paths. The JSON body parser
 * runs before authentication, so without this any caller could trigger that
 * page with a malformed body. Responses here never include error details.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = clientErrorStatus(err) ?? 500;
  if (status === 500) {
    logger.error({ path: req.path, error: describeError(err) }, 'Unhandled error');
  } else {
    const reason = (err as { type?: unknown }).type;
    logger.warn({ ip: req.ip, status, reason }, 'Rejected request: invalid body');
  }

  const label = STATUS_CODES[status] ?? 'Error';
  const detail = status === 400 ? ': invalid JSON body' : '';
  res.status(status).json({ error: `${label}${detail}` });
};

export function createApp(config: Config): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use('/health', healthRouter());
  app.use('/webhook', webhookRouter(config));

  // Unknown routes get JSON too, like every other response.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Must be registered last so it catches errors from everything above.
  app.use(errorHandler);

  return app;
}
