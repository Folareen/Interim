import { z } from 'zod';

const contactSchema = z.object({
  SUPPORT_EMAIL: z.preprocess((value) => (value === '' ? undefined : value), z.email().optional()),
});

/** The public support address, when the operator has configured one. */
export const supportEmail = contactSchema.parse(process.env).SUPPORT_EMAIL;
