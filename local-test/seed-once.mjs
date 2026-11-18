import { spawnSync } from 'node:child_process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (
  process.env.LOCAL_TEST_SEED !== 'true' ||
  process.env.NODE_ENV !== 'development' ||
  !databaseUrl ||
  new URL(databaseUrl).hostname !== 'db' ||
  new URL(databaseUrl).pathname !== '/costume_local_test'
) {
  throw new Error('Refusing to seed outside the isolated local Docker database.');
}

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const result = await client.query('SELECT COUNT(*)::int AS count FROM users');
  if (result.rows[0].count === 0) {
    const seed = spawnSync('./node_modules/.bin/tsx', ['prisma/seed.ts'], {
      cwd: '/app/apps/api',
      stdio: 'inherit',
    });
    if (seed.error) throw seed.error;
    if (seed.status !== 0) process.exit(seed.status ?? 1);
  } else {
    console.info('Local database already contains users; preserving existing test data.');
  }
  const accounts = spawnSync('./node_modules/.bin/tsx', ['prisma/seed/local-test-accounts.ts'], {
    cwd: '/app/apps/api',
    stdio: 'inherit',
  });
  if (accounts.error) throw accounts.error;
  if (accounts.status !== 0) process.exit(accounts.status ?? 1);
} finally {
  await client.end();
}
