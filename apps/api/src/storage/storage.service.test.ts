import { describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';

const storage = new StorageService({
  endpoint: 'http://localhost:9000',
  bucket: 'interim',
  region: 'us-east-1',
  accessKeyId: 'id',
  secretAccessKey: 'secret',
});

describe('StorageService.presignPut', () => {
  it('signs a short-lived path-style link that pins the body length', async () => {
    const { url, expiresInSeconds } = await storage.presignPut('raw/p/u', 1234);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/interim/raw/p/u');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe(String(expiresInSeconds));
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });
});

describe('key prefix', () => {
  const prod = new StorageService({
    endpoint: 'http://localhost:9000',
    bucket: 'interim',
    region: 'us-east-1',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    keyPrefix: 'prod/',
  });

  it('puts the prefix in front of the key in a signed link, so production and development never share a file', async () => {
    const { url } = await prod.presignPut('photos/p/a.jpg', 10);
    expect(new URL(url).pathname).toBe('/interim/prod/photos/p/a.jpg');
    expect(new URL(await prod.presignGet('photos/p/a.jpg')).pathname).toBe('/interim/prod/photos/p/a.jpg');
  });

  it('leaves keys alone when there is no prefix', async () => {
    expect(new URL(await storage.presignGet('photos/p/a.jpg')).pathname).toBe('/interim/photos/p/a.jpg');
  });

  // The cleanup job lists and deletes. With a prefix it must only ever ask for, and only ever delete, its own files.
  it('lists and deletes only under the prefix, and hands back keys without it', async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const send = vi.fn((command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (command.constructor.name === 'ListObjectsV2Command')
        return Promise.resolve({ Contents: [{ Key: 'prod/photos/p/a.jpg', LastModified: new Date(0) }] });
      return Promise.resolve({});
    });
    (prod as unknown as { client: { send: typeof send } }).client.send = send;

    const pages = [];
    for await (const page of prod.list('photos/')) pages.push(page);
    await prod.deleteMany(['photos/p/a.jpg']);
    await prod.delete('raw/p/u');

    expect(sent[0]?.input.Prefix).toBe('prod/photos/');
    expect(pages[0]?.map((o) => o.key)).toEqual(['photos/p/a.jpg']);
    expect((sent[1]?.input.Delete as { Objects: { Key: string }[] }).Objects).toEqual([{ Key: 'prod/photos/p/a.jpg' }]);
    expect(sent[2]?.input.Key).toBe('prod/raw/p/u');
  });
});
