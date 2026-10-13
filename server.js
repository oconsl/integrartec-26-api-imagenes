import { app } from './src/app.js';
import { config } from './src/config.js';
import { initDb, pool } from './src/db.js';
import { logger } from './src/logger.js';

await initDb();

const server = app.listen(config.port, () => {
  logger.info('API escuchando', { port: config.port, region: config.awsRegion, bucket: config.s3.bucket });
});

// pm2/systemd mandan SIGTERM al reiniciar: cerramos conexiones prolijamente
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info('apagando', { signal });
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
