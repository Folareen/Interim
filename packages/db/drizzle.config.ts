import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read the repo's .env on its own, so `pnpm db:migrate` would run with no database url.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
