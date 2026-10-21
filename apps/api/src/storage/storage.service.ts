import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

/** Connection settings for the R2 bucket. */
export interface StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}
export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

const PRESIGN_TTL_SECONDS = 600;

/** An object in the bucket, as the cleanup sweep sees it. */
export interface StoredObject {
  key: string;
  lastModified: Date;
}

/** Cloudflare R2 object storage, reached through its S3-compatible API. Only keys are stored elsewhere. */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(STORAGE_CONFIG) config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true, // R2 is addressed by path, not by bucket subdomain
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  /** A short-lived PUT link that only accepts a body of exactly `sizeBytes`. */
  async presignPut(key: string, sizeBytes: number) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentLength: sizeBytes }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return { url, expiresInSeconds: PRESIGN_TTL_SECONDS };
  }

  /** A short-lived link the browser can show an image from. Photos and renders are never public. */
  async presignGet(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  }

  /**
   * Reads an object, refusing anything larger than `maxBytes` before downloading it.
   * @returns undefined when the key does not exist, or `'too_large'`.
   */
  async readCapped(key: string, maxBytes: number): Promise<Buffer | 'too_large' | undefined> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body || (object.ContentLength ?? 0) > maxBytes) return 'too_large';
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof NoSuchKey) return undefined;
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Lists every object under a prefix, one page (up to 1000 keys) at a time. */
  async *list(prefix: string): AsyncGenerator<StoredObject[]> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (page.Contents ?? []).flatMap((o) =>
        o.Key && o.LastModified ? [{ key: o.Key, lastModified: o.LastModified }] : [],
      );
      if (objects.length > 0) yield objects;
      token = page.NextContinuationToken;
    } while (token);
  }

  /** Deletes the keys in batches of 1000. Keys that do not exist are not an error. */
  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
      const result = await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch, Quiet: true } }),
      );
      if (result.Errors?.length) throw new Error(`Failed to delete ${result.Errors.length} objects`);
    }
  }

  /** Deletes everything under a prefix. */
  async deletePrefix(prefix: string): Promise<void> {
    for await (const page of this.list(prefix)) await this.deleteMany(page.map((o) => o.key));
  }
}
