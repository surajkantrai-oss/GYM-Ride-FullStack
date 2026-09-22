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
for (const args of [
  ['exec', 'prisma', 'migrate', 'deploy'],
  [
    'exec',
    'jest',
    '--runInBand',
    '--testRegex',
    '(finance|check-in|reviews-notifications).runtime-spec.ts$',
    '--testTimeout',
    '30000',
  ],
]) {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
