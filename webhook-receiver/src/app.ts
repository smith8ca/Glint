import express, { Express, Request } from 'express';
import { Config } from './config';
import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';

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

  return app;
}
