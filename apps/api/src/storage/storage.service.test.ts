import { describe, expect, it } from 'vitest';
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
