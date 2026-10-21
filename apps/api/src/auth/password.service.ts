import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

// Node types the promisified form without the options argument.
const derive = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: ScryptOptions) => Promise<Buffer>;
const KEY_LENGTH = 32;
// 32 MiB of memory per hash makes guessing expensive on a GPU; the limit is raised above the 32 MiB default it needs.
const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Hashes and checks passwords with scrypt. The stored string carries its own cost, so it can be raised later. */
@Injectable()
export class PasswordService {
  // A real hash to check against when there is no account, so a missing account costs the same time as a wrong password.
  private decoy?: Promise<string>;

  /** Returns `scrypt$N$r$p$salt$hash`. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, KEY_LENGTH, COST);
    return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  /** Whether the password matches the stored hash. With no stored hash it still does the work, then answers false. */
  async verify(password: string, stored: string | null): Promise<boolean> {
    if (stored === null) {
      this.decoy ??= this.hash('decoy-password-for-timing');
      await this.check(password, await this.decoy);
      return false;
    }
    return this.check(password, stored);
  }

  private async check(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const key = await derive(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: COST.maxmem,
    });
    return timingSafeEqual(key, expected);
  }
}
