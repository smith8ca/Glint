import 'dotenv/config';
import { loadConfig } from './config';
import { createApp } from './app';
import { logger } from './logger';

const config = loadConfig();
logger.level = config.logLevel;
const app = createApp(config);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, model: config.anthropicModel }, 'Webhook receiver listening');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
