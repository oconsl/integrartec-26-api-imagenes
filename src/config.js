// Carga .env si existe (Node >= 22). En EC2 podés usar .env o variables de entorno de pm2/systemd.
try {
  process.loadEnvFile();
} catch {
  // sin .env: usamos solo las variables de entorno del sistema
}

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // Región donde viven el bucket y la base (São Paulo para Argentina)
  awsRegion: process.env.AWS_REGION ?? 'sa-east-1',

  db: {
    host: required('DB_HOST'), // en RDS: el "endpoint" de la instancia
    port: Number(process.env.DB_PORT ?? 5432),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    // RDS PostgreSQL exige SSL por defecto (rds.force_ssl = 1)
    ssl: process.env.DB_SSL === 'true',
  },

  s3: {
    bucket: required('S3_BUCKET'),
    // Solo para desarrollo local con LocalStack. En AWS se deja vacío.
    endpoint: process.env.S3_ENDPOINT || undefined,
    urlExpiresIn: Number(process.env.S3_URL_EXPIRES_IN ?? 300),
  },
};
