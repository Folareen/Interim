import { type Db, rateLimit } from '@interim/db';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db.token';
import { OWNER_CONFIG, type OwnerConfig } from '../guard/config';
import { hashToken } from '../guard/token';

/** Limits how often one address or email can try a sign-in step. */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OWNER_CONFIG) private readonly config: OwnerConfig,
  ) {}

  /**
   * Counts one try against a scope and subject in a fixed time window.
   * The subject is hashed before it is stored, so the table holds no emails or addresses.
   * @throws HttpException 429 once the window's limit is passed.
   */
  async hit(scope: string, subject: string, limit: number, windowMs: number): Promise<void> {
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const key = hashToken(this.config.secret, `${scope}:${subject}`);
    const [row] = await this.db
      .insert(rateLimit)
      .values({ key, windowStart, hits: 1 })
      .onConflictDoUpdate({ target: [rateLimit.key, rateLimit.windowStart], set: { hits: sql`${rateLimit.hits} + 1` } })
      .returning({ hits: rateLimit.hits });
    if (!row) throw new Error('Rate limit upsert returned no row');
    if (row.hits > limit) throw new HttpException('Too many tries', HttpStatus.TOO_MANY_REQUESTS);
  }
}
