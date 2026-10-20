import type { StoredObject } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';

/** In-memory stand-in for StorageService, covering the methods the services call. */
export class MemoryStorage {
  readonly objects = new Map<string, { body: Buffer; lastModified: Date }>();

  put(key: string, body: Buffer, _contentType?: string, lastModified = new Date()): Promise<void> {
    this.objects.set(key, { body, lastModified });
    return Promise.resolve();
  }

  readCapped(key: string, maxBytes: number): Promise<Buffer | 'too_large' | undefined> {
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(undefined);
    return Promise.resolve(object.body.length > maxBytes ? 'too_large' : object.body);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  deleteMany(keys: string[]): Promise<void> {
    keys.forEach((key) => this.objects.delete(key));
    return Promise.resolve();
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.deleteMany([...this.objects.keys()].filter((key) => key.startsWith(prefix)));
  }

  async *list(prefix: string): AsyncGenerator<StoredObject[]> {
    const matching = [...this.objects].filter(([key]) => key.startsWith(prefix));
    // Two per page so tests cross page boundaries.
    for (let i = 0; i < matching.length; i += 2) {
      yield matching.slice(i, i + 2).map(([key, o]) => ({ key, lastModified: o.lastModified }));
    }
  }

  presignPut(key: string, sizeBytes: number) {
    return Promise.resolve({ url: `https://s3.test/${key}?size=${sizeBytes}`, expiresInSeconds: 600 });
  }

  asService(): StorageService {
    return this as unknown as StorageService;
  }
}
