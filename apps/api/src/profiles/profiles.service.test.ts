import type { Db } from '@interim/db';
import type { ConsentRequest } from '@interim/types';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { StorageService } from '../storage/storage.service';
import { ProfilesService } from './profiles.service';

// These checks run before any query, so the service never touches the database here.
const service = new ProfilesService({} as Db, {} as StorageService);
const id = '3f2b8a0e-7c2d-4a39-9d57-0d7a6a1f2b11';

const grant = (version: string): ConsentRequest => ({
  action: 'grant',
  version,
  retention: 'standard',
  acceptStorage: true,
  acceptYoucam: true,
  acceptGemini: true,
  acceptOwnPhotosOnly: true,
});

describe('ProfilesService.consent', () => {
  it('refuses a grant for an outdated consent text', async () => {
    const person = { ref: 'abc' };
    await expect(service.consent(id, person, grant('0'))).rejects.toThrow(ConflictException);
  });
});
