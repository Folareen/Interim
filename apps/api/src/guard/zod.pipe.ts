import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Validates a body or param at the HTTP boundary and answers 400 with the zod issues. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.issues);
    return result.data;
  }
}
