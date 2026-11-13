import 'dotenv/config';
import { loadConfig } from './config';
import { createApp } from './app';

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`[server] Webhook receiver listening on port ${config.port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
