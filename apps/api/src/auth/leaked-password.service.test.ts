import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeakedPasswordService } from './leaked-password.service';

const fetchMock = vi.fn<typeof fetch>();
const service = new LeakedPasswordService();
const sha1 = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('LeakedPasswordService', () => {
  it('sends only the first five characters of the hash', async () => {
    fetchMock.mockResolvedValueOnce(new Response('0018A45C4D1DEF81644B54AB7F969B88D65:3'));
    await service.isLeaked('correct horse battery');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1('correct horse battery').slice(0, 5)}`);
    expect(new Headers(init?.headers).get('add-padding')).toBe('true');
  });

  it('is true when the rest of the hash is listed', async () => {
    const hash = sha1('password1234');
    fetchMock.mockResolvedValueOnce(new Response(`AAAAA:1\r\n${hash.slice(5)}:9001\r\n`));
    expect(await service.isLeaked('password1234')).toBe(true);
  });

  it('is false when only other hashes, or a padding entry, are listed', async () => {
    const hash = sha1('a rare long passphrase');
    fetchMock.mockResolvedValueOnce(new Response(`${hash.slice(5)}:0\r\nBBBBB:4`));
    expect(await service.isLeaked('a rare long passphrase')).toBe(false);
  });

  it('lets the password through when the list cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await service.isLeaked('anything at all')).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    expect(await service.isLeaked('anything at all')).toBe(false);
  });
});
