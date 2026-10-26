import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

/**
 * Checks a new password against the Pwned Passwords list. Only the first five characters of the password's
 * SHA-1 leave this server, so the service never learns the password or which entry matched
 * (docs/product/spec.md section 12b).
 */
@Injectable()
export class LeakedPasswordService {
  private readonly log = new Logger(LeakedPasswordService.name);

  /**
   * Whether the password is in a known breach. Fails open when the list cannot be reached, because a
   * third party outage must not stop anyone signing up.
   */
  async isLeaked(password: string): Promise<boolean> {
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
      const response = await fetch(`${RANGE_URL}${prefix}`, {
        // Padding hides how many real matches the range holds from anyone watching the response size.
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const lines = (await response.text()).split('\n');
      return lines.some((line) => {
        const [found, count] = line.trim().split(':');
        return found === suffix && Number(count) > 0;
      });
    } catch (cause) {
      this.log.warn(`Leaked password check skipped: ${cause instanceof Error ? cause.message : 'unknown error'}`);
      return false;
    }
  }
}
