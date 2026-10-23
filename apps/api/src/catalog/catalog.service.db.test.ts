import { type Db, catalogItem } from '@interim/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage';
import { createTestDb } from '../test/test-db';
import { CatalogService, catalogImageDir } from './catalog.service';
import { sampleCatalog } from './sample-catalog';

let db: Db;
let storage: MemoryStorage;
let catalog: CatalogService;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate catalog_item cascade`);
  storage = new MemoryStorage();
  catalog = new CatalogService(db, storage.asService(), catalogImageDir);
});

describe('syncing the sample catalog', () => {
  it('stores each piece with its picture under catalog/', async () => {
    await catalog.sync();

    const rows = await db.select().from(catalogItem);
    expect(rows.map((r) => r.sku).sort()).toEqual(sampleCatalog.map((i) => i.sku).sort());
    for (const row of rows) expect(storage.objects.get(row.imageKey)?.body.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.sku === 'jacket-light')).toMatchObject({ category: 'outer', fit: 'fitted' });
  });

  it('can run again without uploading a picture twice or duplicating a row', async () => {
    await catalog.sync();
    const uploaded = new Map(storage.objects);
    storage.objects.clear();

    await catalog.sync();

    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(catalogItem)).toHaveLength(sampleCatalog.length);
    expect(uploaded.size).toBe(sampleCatalog.length);
  });

  it('updates a piece whose details changed and uploads its picture again', async () => {
    await catalog.sync();
    await db.update(catalogItem).set({ fit: 'relaxed', imageSha256: 'old' }).where(eq(catalogItem.sku, 'jacket-light'));
    storage.objects.clear();

    await catalog.sync();

    expect(storage.objects.has('catalog/jacket-light.jpg')).toBe(true);
    expect((await db.select().from(catalogItem).where(eq(catalogItem.sku, 'jacket-light')))[0]?.fit).toBe('fitted');
  });
});
