import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config({ path: '../.env', quiet: true });
config({ path: '.env', override: true, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
