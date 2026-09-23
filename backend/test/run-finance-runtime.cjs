const { config } = require('dotenv');
const { spawnSync } = require('node:child_process');
config({ path: '../.env', quiet: true });
const url = new URL(process.env.FINANCE_TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local test database required');
url.pathname = '/gymride_finance_test';
url.searchParams.set('schema', 'public');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url.toString(),
  FINANCE_TEST_DATABASE_URL: url.toString(),
};
// Recreate only the hard-coded guarded test database. This also provisions
// PostGIS as the local PostgreSQL superuser before migrations run as gymride.
for (const [command, args] of [
  ['dropdb', ['--if-exists', 'gymride_finance_test']],
  ['createdb', ['--owner', url.username, 'gymride_finance_test']],
  ['psql', ['-d', 'gymride_finance_test', '-c', 'CREATE EXTENSION IF NOT EXISTS postgis']],
  ['pnpm', ['exec', 'prisma', 'migrate', 'deploy']],
  [
    'pnpm',
    ['exec', 'jest', '--runInBand', '--testRegex', '(finance|check-in|reviews-notifications|flex|recommendations).runtime-spec.ts$', '--testTimeout', '30000'],
  ],
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
