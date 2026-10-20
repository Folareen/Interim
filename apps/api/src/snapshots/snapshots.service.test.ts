import type { Db } from '@interim/db';
import { ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProfilesService } from '../profiles/profiles.service';
import type { StorageService } from '../storage/storage.service';
import { SnapshotsService } from './snapshots.service';

const owner = { ref: 'abc' };
const profileId = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';

function build(consentCurrent: boolean) {
  const presignPut = vi.fn((key: string, sizeBytes: number) =>
    Promise.resolve({ url: `https://s3.test/${key}?size=${sizeBytes}`, expiresInSeconds: 600 }),
  );
  const profiles = { get: vi.fn(() => Promise.resolve({ consentCurrent })) } as unknown as ProfilesService;
  const storage = { presignPut } as unknown as StorageService;
  const service = new SnapshotsService({} as Db, profiles, storage, { maxUploadBytes: 1000 });
  return { service, presignPut };
}

describe('SnapshotsService.createUploads', () => {
  it('refuses links before the person has consented', async () => {
    const { service, presignPut } = build(false);
    await expect(service.createUploads(profileId, owner, { uploads: [{ kind: 'front', sizeBytes: 10 }] })).rejects.toThrow(
      ForbiddenException,
    );
    expect(presignPut).not.toHaveBeenCalled();
  });

  it('refuses a photo over the size limit before signing anything', async () => {
    const { service, presignPut } = build(true);
    await expect(
      service.createUploads(profileId, owner, {
        uploads: [
          { kind: 'front', sizeBytes: 10 },
          { kind: 'left', sizeBytes: 1001 },
        ],
      }),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it('returns one link per photo, keyed under raw/<profile>/<upload>', async () => {
    const { service } = build(true);
    const { uploads } = await service.createUploads(profileId, owner, {
      uploads: [
        { kind: 'front', sizeBytes: 10 },
        { kind: 'top', sizeBytes: 20 },
      ],
    });
    expect(uploads.map((u) => u.kind)).toEqual(['front', 'top']);
    expect(new Set(uploads.map((u) => u.uploadId)).size).toBe(2);
    expect(uploads[0]?.url).toContain(`raw/${profileId}/${uploads[0]?.uploadId}`);
    expect(uploads[1]?.url).toContain('size=20');
  });
});
