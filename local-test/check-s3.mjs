import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
const key = `catalog/local-test/smoke-${Date.now()}.txt`;
const privateKey = `catalog-staging/local-test/smoke-${Date.now()}.txt`;
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: 'local S3 smoke',
      ContentType: 'text/plain',
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: privateKey,
      Body: 'private',
      ContentType: 'text/plain',
    }),
  );
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if ((await object.Body.transformToString()) !== 'local S3 smoke') {
    throw new Error('S3 object content mismatch');
  }
  const publicRead = await fetch(`${process.env.S3_ENDPOINT}/${bucket}/${key}`);
  const seedImageRead = await fetch(
    `${process.env.S3_ENDPOINT}/${bucket}/seed/catalog/ad-lotus.webp`,
  );
  const privateRead = await fetch(`${process.env.S3_ENDPOINT}/${bucket}/${privateKey}`);
  if (publicRead.status !== 200 || seedImageRead.status !== 200 || privateRead.status !== 403) {
    throw new Error(
      `Unexpected anonymous read: catalog=${publicRead.status}, seed=${seedImageRead.status}, staging=${privateRead.status}`,
    );
  }
  console.info('Local S3 read/write and catalog-only public access: OK');
} finally {
  await Promise.all(
    [key, privateKey].map((item) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item })).catch(() => {}),
    ),
  );
  client.destroy();
}
