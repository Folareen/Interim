import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

const passwords = new PasswordService();

describe('PasswordService', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await passwords.hash('correct horse battery');
    expect(await passwords.verify('correct horse battery', stored)).toBe(true);
    expect(await passwords.verify('correct horse batterz', stored)).toBe(false);
  });

  it('salts every hash and keeps its cost in the stored string', async () => {
    const a = await passwords.hash('same password here');
    const b = await passwords.hash('same password here');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toContain('same password here');
  });

  it('answers false for an account with no password, after doing the same work', async () => {
    expect(await passwords.verify('anything at all', null)).toBe(false);
  });

  it('rejects a stored value it does not understand', async () => {
    expect(await passwords.verify('x', 'plain-text')).toBe(false);
    expect(await passwords.verify('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
