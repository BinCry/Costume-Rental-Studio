import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const bucket = process.env.S3_BUCKET;
const models = [
  ['ad-lotus', 'Áo dài Sen Việt', '#f5d7df', '#b71d5b'],
  ['ad-pearl', 'Áo dài Ngọc Trai', '#e8e0f0', '#5b3d82'],
  ['cp-nhatbinh', 'Nhật Bình Hoàng Gia', '#f6e0c1', '#a33d36'],
  ['ev-gala', 'Đầm Dạ Hội Ánh Sao', '#dfe5f5', '#3e5385'],
  ['ev-tuxedo', 'Tuxedo Midnight', '#e3e5e9', '#293243'],
  ['cs-wizard', 'Pháp Sư Học Viện', '#dcece9', '#2f6968'],
];
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

try {
  for (const [code, , background, accent] of models) {
    const key = `seed/catalog/${code}.webp`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
        <rect width="900" height="1200" fill="${background}"/>
        <rect x="55" y="55" width="790" height="1090" rx="36" fill="white" fill-opacity=".52"/>
        <path d="M450 255c-35 0-63 28-63 63 0 26 15 48 36 58l-15 38-109 50-98 150 77 46 88-111 5 86-72 325h302l-72-325 5-86 88 111 77-46-98-150-109-50-15-38c21-10 36-32 36-58 0-35-28-63-63-63z" fill="${accent}" fill-opacity=".74"/>
        <path d="M350 960h200" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>
        <circle cx="425" cy="1050" r="12" fill="${accent}" fill-opacity=".45"/>
        <circle cx="450" cy="1050" r="12" fill="${accent}" fill-opacity=".7"/>
        <circle cx="475" cy="1050" r="12" fill="${accent}"/>
      </svg>`;
    const bytes = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/webp' }),
    );
  }
  console.info('Six local catalog placeholder images are available.');
} finally {
  client.destroy();
}
