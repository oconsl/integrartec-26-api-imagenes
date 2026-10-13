# api-test-aws

La app de ejemplo de la **Clase 44 — Introducción a AWS**: una API Node.js que **registra usuarios** (PostgreSQL) y permite **subir fotos de perfil** (S3).

Está pensada para recorrer los conceptos de la clase con código real: corre igual en tu notebook y en una EC2; lo único que cambia es la configuración.

## Qué pieza de la clase usa cada parte

| Concepto de la clase | Dónde aparece en el proyecto |
| --- | --- |
| **Región** (`sa-east-1`) | `AWS_REGION` en `.env` |
| **EC2** (servidor 24/7) | `server.js` + `deploy/ecosystem.config.cjs` (pm2) + `deploy/user-data.sh` |
| **IAM Role** (sin claves en el código) | `src/s3.js` no recibe credenciales: el SDK las toma del Role. Política: `deploy/iam-policy-ec2.json` |
| **Mínimo privilegio** | La EC2 solo puede `PutObject`/`GetObject` sobre `curso-app-imagenes/usuarios/*` |
| **Security Groups** | Ver paso 4 del deploy: 3000 abierto a Internet, 5432 solo desde el SG de la API |
| **S3** (bucket, object, key) | Bucket `curso-app-imagenes`, key `usuarios/avatar-<id>.jpg`. En la base se guarda **solo la key** |
| **Bucket privado** | Las fotos se muestran con **URLs firmadas** que vencen (`S3_URL_EXPIRES_IN`) |
| **RDS** (servicio administrado) | `src/db.js`: se conecta igual que a cualquier PostgreSQL; solo cambia `DB_HOST` |
| **Lambda** (eventos) | `lambda/miniaturas/`: S3 dispara la función cuando se sube una foto |
| **CloudWatch** | Logs JSON por request (`src/logger.js`), `GET /health`, `deploy/cloudwatch-agent.json` |

## Endpoints

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/health` | Verifica conexión con la base y con el bucket (`200` ok / `503` degraded) |
| `POST` | `/usuarios` | Registra un usuario `{ nombre, email, password }` |
| `GET` | `/usuarios` | Lista usuarios |
| `GET` | `/usuarios/:id` | Devuelve el usuario + `foto_url` (URL firmada, temporal) |
| `POST` | `/usuarios/:id/foto` | Sube la foto (multipart, campo `foto`, JPG/PNG/WEBP, máx. 5 MB) a S3 |
| `GET` | `/usuarios/:id/foto` | Redirige a la foto en S3 |

Hay ejemplos listos en `requests.http`.

## Correrla local (sin cuenta de AWS)

Necesitás Node.js 22+ y Docker (o Podman). Docker levanta un **PostgreSQL** (hace de RDS) y **LocalStack** (emula S3 y crea el bucket).

```bash
npm install
cp .env.example .env
docker compose up -d
npm run dev
```

Probala:

```bash
curl localhost:3000/health
curl -X POST localhost:3000/usuarios -H 'content-type: application/json' \
  -d '{"nombre":"Ana","email":"ana@example.com","password":"secreta123"}'
curl -X POST localhost:3000/usuarios/1/foto -F foto=@avatar.jpg
curl -L localhost:3000/usuarios/1/foto -o descargada.jpg
```

## Desplegarla en AWS

> ⚠️ **Antes de empezar:** creá un **Budget** mensual bajo (ej. USD 5) con alerta por email. Al terminar, **borrá todo** (paso final). Apagado no siempre es sin costo.

Todo en la región **South America (São Paulo) · `sa-east-1`**.

1. **S3** → Create bucket `curso-app-imagenes` (el nombre es único en todo AWS: si está tomado, usá otro y cambiá `S3_BUCKET` y las políticas). Dejá **Block Public Access activado**.
2. **IAM** → Create policy `curso-app-api-s3` con `deploy/iam-policy-ec2.json` → Create role para **EC2** (ej. `curso-app-api-role`) con esa política **y** la administrada por AWS `CloudWatchAgentServerPolicy` (la necesita el CloudWatch agent para mandar logs y métricas).
3. **EC2** → Launch instance:
   - AMI: Amazon Linux 2023 · tipo: `t3.micro`
   - Key pair para SSH
   - Red: VPC por defecto, subnet pública, IP pública activada
   - Security Group `api-sg`: puerto **22 solo desde tu IP**, puerto **3000 desde `0.0.0.0/0`**
   - Advanced → IAM instance profile: `curso-app-api-role`
   - Advanced → User data: pegá `deploy/user-data.sh` (cambiando `REPO_URL`)
4. **RDS** → Create database: PostgreSQL, plantilla *Free tier* / *Sandbox*, nombre de base `curso_app`, **sin acceso público**. Security Group `db-sg`: puerto **5432 solo desde `api-sg`** (nunca desde `0.0.0.0/0`). Copiá el **endpoint**.
5. Por SSH en la EC2:
   ```bash
   cd ~/api-test-aws
   cp .env.example .env
   nano .env   # DB_HOST=<endpoint RDS>, DB_PASSWORD, DB_SSL=true
               # y BORRÁ S3_ENDPOINT / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
   pm2 start deploy/ecosystem.config.cjs
   pm2 save && pm2 startup   # copiá y ejecutá el comando que imprime
   ```
6. Abrí `http://<IP-pública>:3000/health` → `{"status":"ok"}`. Si falla:
   - `database: error ... timeout` → revisá el Security Group de RDS.
   - `s3: error AccessDenied` / `CredentialsProviderError` → revisá el Role de la EC2.
   - No responde nada → revisá que el Security Group tenga el 3000 abierto y que uses `http://` (no `https://`).
7. **CloudWatch** → Log groups → `/curso-app/api`: cada request aparece como una línea JSON. Probá una alarma sobre `CPUUtilization` de la EC2 > 80 % durante 5 minutos.

### Bonus: Lambda de miniaturas

1. Bucket nuevo `curso-app-miniaturas` (privado).
2. Role para **Lambda** con `deploy/iam-policy-lambda.json`.
3. Empaquetá la función (instala `sharp` para Linux x64):
   ```bash
   cd lambda/miniaturas && npm run zip
   ```
4. Lambda → Create function: Node.js 22.x, arquitectura x86_64, el role del paso 2 → subí `miniaturas.zip`. Timeout: 30 s, memoria: 512 MB.
5. Add trigger → S3 → `curso-app-imagenes`, evento *All object create events*, prefijo `usuarios/`.
6. Subí una foto con la API y mirá `curso-app-miniaturas/usuarios/`. Los logs de la función están en CloudWatch (`/aws/lambda/<nombre>`) sin configurar nada.

### Limpieza (¡importante!)

Terminate la EC2 · Delete la base RDS (sin snapshot final si es práctica) · vaciá y borrá los buckets · borrá la Lambda, los roles, las políticas y los log groups.

## Estructura

```
server.js                 arranque + apagado prolijo (SIGTERM de pm2)
src/
  app.js                  Express, /health, logs por request, manejo de errores
  config.js               variables de entorno
  db.js                   pool de PostgreSQL (RDS)
  s3.js                   cliente S3: PutObject, URL firmada de GetObject
  logger.js               logs JSON para CloudWatch
  routes/usuarios.js      registro de usuarios y subida de fotos
db/schema.sql             tabla usuarios (se crea sola al arrancar)
deploy/                   políticas IAM, pm2, user data de EC2, CloudWatch agent
lambda/miniaturas/        función que genera miniaturas al subir una foto
local/                    script que crea el bucket en LocalStack
docker-compose.yml        PostgreSQL + LocalStack para desarrollo local
```
