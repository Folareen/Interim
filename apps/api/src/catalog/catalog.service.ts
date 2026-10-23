import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Db, catalogItem } from '@interim/db';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.token';
import { StorageService } from '../storage/storage.service';
import { sampleCatalog } from './sample-catalog';

export const CATALOG_IMAGES = Symbol('CATALOG_IMAGES');
/** Where the sample pieces' pictures are read from. `nest build` copies them next to the compiled code. */
export const catalogImageDir = path.join(__dirname, 'images');

/**
 * Keeps the `catalog_item` rows and the pictures in storage in step with the sample catalog in
 * code. Both the API and the worker run it at start, so whichever comes up first fills the table.
 */
@Injectable()
export class CatalogService implements OnApplicationBootstrap {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(CATALOG_IMAGES) private readonly imageDir: string,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  /** Writes each piece's row, and uploads its picture when it is new or has changed. */
  async sync(): Promise<void> {
    for (const item of sampleCatalog) {
      const bytes = await readFile(path.join(this.imageDir, `${item.sku}.jpg`));
      const imageSha256 = createHash('sha256').update(bytes).digest('hex');
      const imageKey = `catalog/${item.sku}.jpg`;
      const [existing] = await this.db.select({ sha: catalogItem.imageSha256 }).from(catalogItem).where(eq(catalogItem.sku, item.sku));
      if (existing?.sha !== imageSha256) await this.storage.put(imageKey, bytes, 'image/jpeg');
      const row = { name: item.name, category: item.category, fit: item.fit, sizeChart: item.sizeChart, imageKey, imageSha256 };
      await this.db
        .insert(catalogItem)
        .values({ sku: item.sku, ...row })
        .onConflictDoUpdate({ target: catalogItem.sku, set: row });
    }
  }
}
