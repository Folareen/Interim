import { youcamModeSchema } from '@interim/types';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  YOUCAM_API_KEY: z.string().default(''),
  YOUCAM_BASE_URL: z.string().url().default('https://yce-api-01.makeupar.com'),
  YOUCAM_MODE: youcamModeSchema.default('replay'),
  YOUCAM_FIXTURES_DIR: z.string().default('../../packages/fixtures/youcam'), // relative to apps/api
  JUDGE_MODE_FORCE_REPLAY: z.enum(['true', 'false']).default('true'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  UNIT_BUDGET_PER_RUN: z.coerce.number().default(50),
  UNIT_BUDGET_PER_PROFILE: z.coerce.number().default(500),
  UNIT_BUDGET_PER_DAY: z.coerce.number().default(2000),
  UNIT_BUDGET_PER_SOURCE_PER_DAY: z.coerce.number().default(100),
  UNIT_BUDGET_PER_PARTNER: z.coerce.number().default(1000),
  LIVE_CALLS_ENABLED: z.enum(['true', 'false']).default('false'),
  SESSION_SECRET: z.string().min(32),
  MAX_UPLOAD_BYTES: z.coerce.number().default(12 * 1024 * 1024),
  PARTNER_API_KEYS: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

// Validated once at startup. Everything else receives typed config.
export const env: Env = envSchema.parse(process.env);
