-- En la base guardamos solo la KEY de la foto, no el archivo (el archivo vive en S3).
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  foto_key      TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
