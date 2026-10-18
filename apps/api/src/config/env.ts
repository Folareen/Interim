import { youcamModeSchema } from '@interim/types';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  YOUCAM_API_KEY: z.string().default(''),
  YOUCAM_BASE_URL: z.string().default(''),
  YOUCAM_MODE: youcamModeSchema.default('replay'),
  JUDGE_MODE_FORCE_REPLAY: z.enum(['true', 'false']).default('true'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  UNIT_BUDGET_PER_RUN: z.coerce.number().default(50),
  UNIT_BUDGET_PER_PROFILE: z.coerce.number().default(500),
  UNIT_BUDGET_PER_DAY: z.coerce.number().default(2000),
});

export type Env = z.infer<typeof envSchema>;

// Validated once at startup. Everything else receives typed config.
export const env: Env = envSchema.parse(process.env);
