import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

export interface StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}
export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

const PRESIGN_TTL_SECONDS = 600;

/** S3-compatible object storage: MinIO locally, R2 in production. Only keys are stored elsewhere. */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(STORAGE_CONFIG) config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true, // MinIO and R2 do not use bucket subdomains
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
}
