import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';

// La API se conecta a RDS igual que a cualquier PostgreSQL: host, puerto, usuario y contraseña.
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  // Para validar el certificado de RDS, descargá el bundle de AWS y usá { ca: fs.readFileSync(...) }
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

// Crea la tabla si no existe (suficiente para la clase; en un proyecto real usarías migraciones).
export async function initDb() {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}
