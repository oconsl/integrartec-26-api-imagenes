import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { getObjectUrl, putObject } from '../s3.js';

const scryptAsync = promisify(scrypt);

const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// La foto queda en memoria (máx. 5 MB) y de ahí va directo a S3: nada se guarda en el disco de la EC2.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXTENSIONES),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

const COLUMNAS = 'id, nombre, email, foto_key, creado_en';

async function buscarUsuario(id) {
  if (!Number.isInteger(Number(id))) throw new HttpError(400, 'id inválido');
  const { rows } = await query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado');
  return rows[0];
}

export const usuarios = Router();

// Registrar usuario
usuarios.post('/', async (req, res) => {
  const { nombre, email, password } = req.body ?? {};
  if (!nombre || !email || !password) throw new HttpError(400, 'nombre, email y password son obligatorios');
  if (password.length < 8) throw new HttpError(400, 'password debe tener al menos 8 caracteres');

  try {
    const { rows } = await query(
      `INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING ${COLUMNAS}`,
      [nombre, email.toLowerCase(), await hashPassword(password)],
    );
    logger.info('usuario registrado', { usuarioId: rows[0].id });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese email');
    throw err;
  }
});

// Listar usuarios
usuarios.get('/', async (_req, res) => {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM usuarios ORDER BY id`);
  res.json(rows);
});

// Ver un usuario (con URL temporal de su foto, si tiene)
usuarios.get('/:id', async (req, res) => {
  const usuario = await buscarUsuario(req.params.id);
  const fotoUrl = usuario.foto_key ? await getObjectUrl(usuario.foto_key) : null;
  res.json({ ...usuario, foto_url: fotoUrl });
});

// Subir foto de perfil → S3 (PutObject). En la base guardamos solo la key.
usuarios.post('/:id/foto', upload.single('foto'), async (req, res) => {
  const usuario = await buscarUsuario(req.params.id);
  if (!req.file) throw new HttpError(400, 'Enviá una imagen JPG, PNG o WEBP en el campo "foto"');

  const key = `usuarios/avatar-${usuario.id}.${EXTENSIONES[req.file.mimetype]}`;
  await putObject(key, req.file.buffer, req.file.mimetype);
  await query('UPDATE usuarios SET foto_key = $1 WHERE id = $2', [key, usuario.id]);

  logger.info('foto subida', { usuarioId: usuario.id, key, bytes: req.file.size });
  res.status(201).json({ foto_key: key, foto_url: await getObjectUrl(key) });
});

// Redirige a la foto (URL firmada de S3)
usuarios.get('/:id/foto', async (req, res) => {
  const usuario = await buscarUsuario(req.params.id);
  if (!usuario.foto_key) throw new HttpError(404, 'El usuario no tiene foto');
  res.redirect(await getObjectUrl(usuario.foto_key));
});
