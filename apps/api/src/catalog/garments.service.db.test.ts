import { type Db, garment, profile } from '@interim/db';
import { CONSENT_VERSION } from '@interim/rules';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { CatalogService, catalogImageDir } from './catalog.service';
import { GarmentsService } from './garments.service';

const alice = { ref: 'alice' };
const bob = { ref: 'bob' };

let db: Db;
let garments: GarmentsService;
let profileId: string;

async function newProfile(templateKey: 'weight_change' | 'hair_loss_ahead', ownerRef = alice.ref) {
  const [row] = await db
    .insert(profile)
    .values({ templateKey, ownerRef, consentVersion: CONSENT_VERSION, consentedAt: new Date() })
    .returning({ id: profile.id });
  if (!row) throw new Error('no profile');
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate profile, catalog_item cascade`);
  const storage = new MemoryStorage();
  await new CatalogService(db, storage.asService(), catalogImageDir).sync();
  garments = new GarmentsService(db, storage.asService());
  profileId = await newProfile('weight_change');
});

describe('the wardrobe', () => {
  it('lists the whole catalog with a link to each picture, none saved at first', async () => {
    const items = await garments.list(profileId, alice);
    expect(items.map((i) => i.sku)).toEqual(['jacket-light', 'jumper-knit', 'shirt-oxford', 'tee-crew']);
    expect(items.every((i) => !i.saved && i.imageUrl.includes('catalog/'))).toBe(true);
  });

  it('saves a piece once however often it is asked, and removes it again', async () => {
    await garments.save(profileId, alice, 'tee-crew');
    await garments.save(profileId, alice, 'tee-crew');

    expect((await garments.list(profileId, alice)).filter((i) => i.saved).map((i) => i.sku)).toEqual(['tee-crew']);
    expect(await db.select().from(garment).where(eq(garment.profileId, profileId))).toHaveLength(1);

    await garments.remove(profileId, alice, 'tee-crew');
    await garments.remove(profileId, alice, 'tee-crew');
    expect((await garments.list(profileId, alice)).some((i) => i.saved)).toBe(false);
  });

  it('refuses a piece that is not in the catalog', async () => {
    await expect(garments.save(profileId, alice, 'cape')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for another person’s profile, whatever the call', async () => {
    await expect(garments.list(profileId, bob)).rejects.toBeInstanceOf(NotFoundException);
    await expect(garments.save(profileId, bob, 'tee-crew')).rejects.toBeInstanceOf(NotFoundException);
    await expect(garments.remove(profileId, bob, 'tee-crew')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps one person’s saves out of another profile’s list', async () => {
    const other = await newProfile('weight_change', bob.ref);
    await garments.save(profileId, alice, 'jumper-knit');
    expect((await garments.list(other, bob)).some((i) => i.saved)).toBe(false);
  });

  it('is only for situations that use fit', async () => {
    const hair = await newProfile('hair_loss_ahead');
    await expect(garments.list(hair, alice)).rejects.toBeInstanceOf(ConflictException);
    await expect(garments.save(hair, alice, 'tee-crew')).rejects.toBeInstanceOf(ConflictException);
  });

  it('is deleted with the profile', async () => {
    await garments.save(profileId, alice, 'tee-crew');
    await db.delete(profile).where(eq(profile.id, profileId));
    expect(await db.select().from(garment)).toEqual([]);
  });
});
