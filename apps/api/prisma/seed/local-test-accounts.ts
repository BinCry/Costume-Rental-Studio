import { argon2id, hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.LOCAL_TEST_ACCOUNT_PASSWORD;
if (!databaseUrl || !password || password.length < 12 || process.env.LOCAL_TEST_SEED !== 'true') {
  throw new Error('Local test account seeding requires an isolated database and password.');
}
const parsedUrl = new URL(databaseUrl);
if (
  process.env.NODE_ENV !== 'development' ||
  parsedUrl.hostname !== 'db' ||
  parsedUrl.pathname !== '/costume_local_test'
) {
  throw new Error('Refusing to set test passwords outside the isolated Docker database.');
}

const emails = [
  'admin@costume.local',
  'sales.q1@costume.local',
  'sales.q3@costume.local',
  'inventory.q1@costume.local',
  'inventory.q3@costume.local',
  'customer1@costume.local',
  'customer2@costume.local',
  'customer3@costume.local',
  'customer4@costume.local',
  'customer5@costume.local',
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  if (existing.length !== emails.length) {
    throw new Error('Demo accounts are incomplete; run the demo seed before setting passwords.');
  }
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const result = await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { passwordHash, emailVerifiedAt: new Date() },
  });
  if (result.count !== emails.length) throw new Error('Local test account update was incomplete.');
  console.info(`Local test login enabled for ${result.count} seeded accounts.`);
} finally {
  await prisma.$disconnect();
}
