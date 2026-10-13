// Lambda disparada por S3 (evento "ObjectCreated" con prefijo usuarios/ en curso-app-imagenes).
// Lee la foto original, genera una miniatura de 200x200 y la guarda en OTRO bucket
// (si la escribiera en el mismo prefijo, se volvería a disparar en un loop infinito).
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});
const BUCKET_DESTINO = process.env.BUCKET_MINIATURAS ?? 'curso-app-miniaturas';

export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = Buffer.from(await original.Body.transformToByteArray());

    const miniatura = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp().toBuffer();
    const keyDestino = key.replace(/\.[^.]+$/, '.webp');

    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET_DESTINO, Key: keyDestino, Body: miniatura, ContentType: 'image/webp' }),
    );

    // Este console.log aparece solo en CloudWatch Logs (/aws/lambda/<nombre-de-la-función>)
    console.log(JSON.stringify({ message: 'miniatura generada', origen: key, destino: keyDestino, bytes: miniatura.length }));
  }
};
