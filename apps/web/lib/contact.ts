import { messages } from '@interim/templates';
import { z } from 'zod';

const contactSchema = z.object({
  SUPPORT_EMAIL: z.preprocess((value) => (value === '' ? undefined : value), z.email().default(messages.en.common.supportEmail)),
});

/** The public support address, with an optional deployment override. */
export const supportEmail = contactSchema.parse(process.env).SUPPORT_EMAIL;
