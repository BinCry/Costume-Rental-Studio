import { HeadBucketCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';

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

const policy = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'PublicCatalogImagesOnly',
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucket}/catalog/*`, `arn:aws:s3:::${bucket}/seed/catalog/*`],
    },
  ],
};

try {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }));
  console.info('Local S3 bucket ready; public catalog images enabled.');
} finally {
  client.destroy();
}
