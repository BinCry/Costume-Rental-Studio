import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCore } from './seed/core.js';
import { seedDemo } from './seed/demo.js';
import { getSeedAnchor } from './seed/helpers.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const anchor = getSeedAnchor();
  const profile =
    process.env.SEED_PROFILE ?? (process.env.NODE_ENV === 'production' ? 'core' : 'demo');
  if (profile !== 'core' && profile !== 'demo') {
    throw new Error('SEED_PROFILE must be either "core" or "demo".');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    profile === 'demo' &&
    process.env.ALLOW_PRODUCTION_DEMO_SEED !== 'true'
  ) {
    throw new Error(
      'Demo seed is disabled in production. Set ALLOW_PRODUCTION_DEMO_SEED=true only if this is intentional.',
    );
  }

  console.info(`Seeding database with profile ${profile} and anchor ${anchor.toISOString()}...`);

  await prisma.$transaction(
    async (transaction) => {
      const core = await seedCore(transaction);
      if (profile === 'demo') await seedDemo(transaction, core, anchor);
    },
    { timeout: 120_000 },
  );

  const [branches, users, costumes, units, orders, payments, crmCases] = await Promise.all([
    prisma.branch.count(),
    prisma.user.count(),
    prisma.costumeModel.count(),
    prisma.costumeUnit.count(),
    prisma.rentalOrder.count(),
    prisma.payment.count(),
    prisma.crmCase.count(),
  ]);
  console.info('Database seed completed successfully.', {
    branches,
    users,
    costumes,
    units,
    orders,
    payments,
    crmCases,
  });
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
