import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

// Sin access keys en el código: en EC2 el SDK toma credenciales temporales del IAM Role
// de la instancia. En local las toma de ~/.aws o de AWS_ACCESS_KEY_ID (LocalStack).
export const s3 = new S3Client({
  region: config.awsRegion,
  ...(config.s3.endpoint && { endpoint: config.s3.endpoint, forcePathStyle: true }),
});

export function putObject(key, body, contentType) {
  return s3.send(
    new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

// El bucket es privado (Block Public Access): para mostrar la foto generamos una URL
// firmada que vence en unos minutos, en lugar de hacer público el objeto.
export function getObjectUrl(key) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), {
    expiresIn: config.s3.urlExpiresIn,
  });
}

export function checkBucket() {
  return s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
}
