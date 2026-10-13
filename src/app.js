import express from 'express';
import multer from 'multer';
import { query } from './db.js';
import { logger } from './logger.js';
import { usuarios } from './routes/usuarios.js';
import { checkBucket } from './s3.js';

export const app = express();

app.use(express.json());

// Log de cada request: método, ruta, status y duración (para métricas y alarmas en CloudWatch)
app.use((req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(performance.now() - start),
    });
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ app: 'api-test-aws', mensaje: 'Hola desde la API de la Clase 44 👋' });
});

// Health check: sirve para probar desde el navegador que EC2 → RDS y EC2 → S3 funcionan
// (Security Groups, IAM Role, endpoint de RDS) y, más adelante, para un Load Balancer.
app.get('/health', async (_req, res) => {
  const checks = {};
  try {
    await query('SELECT 1');
    checks.database = 'ok';
  } catch (err) {
    checks.database = `error: ${err.message}`;
  }
  try {
    await checkBucket();
    checks.s3 = 'ok';
  } catch (err) {
    checks.s3 = `error: ${err.name}`;
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

app.use('/usuarios', usuarios);

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Express 5 manda acá los errores de los handlers async
app.use((err, req, res, _next) => {
  const status = err instanceof multer.MulterError ? 400 : (err.status ?? 500);
  if (status >= 500) logger.error('error no controlado', { path: req.originalUrl, error: err.message });
  res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message });
});
