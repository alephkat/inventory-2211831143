import 'dotenv/config';
import { config } from './shared/config/env';
import { createApp } from './app';

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Inventory API listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[server] Environment: ${config.nodeEnv}`);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[server] Uncaught Exception:', err);
  process.exit(1);
});
