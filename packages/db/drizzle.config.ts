import { defineConfig } from 'drizzle-kit';

// Reads DATABASE_URL from the root .env unless it is already set.
if (!process.env.DATABASE_URL) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
