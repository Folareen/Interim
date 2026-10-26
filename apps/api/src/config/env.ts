import { youcamModeSchema } from '@interim/types';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    R2_ENDPOINT: z.string().url(),
    R2_BUCKET: z.string().min(1),
    R2_REGION: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    YOUCAM_API_KEY: z.string().default(''),
    YOUCAM_BASE_URL: z.string().url().default('https://yce-api-01.makeupar.com'),
    YOUCAM_MODE: youcamModeSchema.default('replay'),
    YOUCAM_FIXTURES_DIR: z.string().default('../../packages/fixtures/youcam'), // relative to apps/api
    PLANNER_FIXTURES_DIR: z.string().default('../../packages/fixtures/planner'), // recorded planner output, relative to apps/api
    JUDGE_MODE_FORCE_REPLAY: z.enum(['true', 'false']).default('true'),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().default(''),
    LLM_MODEL: z.string().default('gemini-2.5-flash'),
    UNIT_BUDGET_PER_RUN: z.coerce.number().default(50),
    UNIT_BUDGET_PER_PROFILE: z.coerce.number().default(500),
    UNIT_BUDGET_PER_DAY: z.coerce.number().default(2000),
    UNIT_BUDGET_PER_SOURCE_PER_DAY: z.coerce.number().default(100),
    LIVE_CALLS_ENABLED: z.enum(['true', 'false']).default('false'),
    SESSION_SECRET: z.string().min(32),
    DATA_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'DATA_KEY must be 64 hex characters (32 bytes)'), // encrypts saved reflections; losing it makes them unreadable
    MAX_UPLOAD_BYTES: z.coerce.number().default(12 * 1024 * 1024),
    TURNSTILE_SECRET_KEY: z.string().default(''),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'), // where the browser reaches the web app; emailed links and Google's return address start here
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1), // proxies in front of the API, so rate limits see the person's address
    MAIL_MODE: z.enum(['log', 'brevo']).default('log'),
    BREVO_API_KEY: z.string().default(''),
    MAIL_FROM_EMAIL: z.union([z.email(), z.literal('')]).default(''),
    MAIL_FROM_NAME: z.string().min(1).default('Interim'),
    VAPID_PUBLIC_KEY: z.string().default(''), // web push identity; notifications are off without it. Make a pair with: npx web-push generate-vapid-keys
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default(''), // a mailto: or https address push services can reach; defaults to WEB_ORIGIN
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (value.MAIL_MODE === 'brevo' && (!value.BREVO_API_KEY || !value.MAIL_FROM_EMAIL)) {
      issue('MAIL_MODE', 'Brevo needs BREVO_API_KEY and MAIL_FROM_EMAIL');
    }
    if (value.NODE_ENV === 'production' && value.MAIL_MODE === 'log') {
      issue('MAIL_MODE', 'Production must send mail through Brevo; log mode would write sign-in links to the logs');
    }
    if (Boolean(value.VAPID_PUBLIC_KEY) !== Boolean(value.VAPID_PRIVATE_KEY)) {
      issue('VAPID_PRIVATE_KEY', 'Web push needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY together');
    }
    if (value.GOOGLE_CLIENT_ID && !value.GOOGLE_CLIENT_SECRET) {
      issue('GOOGLE_CLIENT_SECRET', 'Google sign in needs the client secret with the client id');
    }
  });

export type Env = z.infer<typeof envSchema>;

/** The environment, validated once at startup. Everything else receives typed config. */
export const env: Env = envSchema.parse(process.env);
