import { type Db, catalogItem, garment, profile } from '@interim/db';
import { templates } from '@interim/templates';
import { type GarmentItem, garmentCategorySchema, garmentFitSchema, templateKeySchema } from '@interim/types';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { StorageService } from '../storage/storage.service';

/** The sample catalog as one profile sees it, and the pieces the person has saved from it. */
@Injectable()
export class GarmentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** Every catalog piece, marked saved or not, with a short lived link to its picture. */
  async list(profileId: string, owner: Owner): Promise<GarmentItem[]> {
    await this.fitProfile(profileId, owner);
    const rows = await this.db
      .select({
        sku: catalogItem.sku,
        category: catalogItem.category,
        fit: catalogItem.fit,
        imageKey: catalogItem.imageKey,
        savedId: garment.id,
      })
      .from(catalogItem)
      .leftJoin(garment, and(eq(garment.catalogSku, catalogItem.sku), eq(garment.profileId, profileId)))
      .orderBy(asc(catalogItem.sku));
    return Promise.all(
      rows.map(async (row) => ({
        sku: row.sku,
        category: garmentCategorySchema.parse(row.category),
        fit: garmentFitSchema.parse(row.fit),
        saved: row.savedId !== null,
        imageUrl: await this.storage.presignGet(row.imageKey),
      })),
    );
  }

  /** Saves a piece. Saving it again changes nothing. */
  async save(profileId: string, owner: Owner, sku: string): Promise<void> {
    await this.fitProfile(profileId, owner);
    const [item] = await this.db.select({ sku: catalogItem.sku }).from(catalogItem).where(eq(catalogItem.sku, sku));
    if (!item) throw new NotFoundException();
    await this.db.insert(garment).values({ profileId, catalogSku: sku }).onConflictDoNothing();
  }

  /** Removes a saved piece. Removing one that is not saved changes nothing. */
  async remove(profileId: string, owner: Owner, sku: string): Promise<void> {
    await this.fitProfile(profileId, owner);
    await this.db.delete(garment).where(and(eq(garment.profileId, profileId), eq(garment.catalogSku, sku)));
  }

  /**
   * Looks the profile up for its owner; another owner's profile answers 404.
   * @throws ConflictException when the situation does not use fit, so there are no clothes to save.
   */
  private async fitProfile(profileId: string, owner: Owner): Promise<void> {
    const [row] = await this.db
      .select({ templateKey: profile.templateKey })
      .from(profile)
      .where(and(eq(profile.id, profileId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    if (!templates[templateKeySchema.parse(row.templateKey)].usesFit) throw new ConflictException('This situation does not use clothes.');
  }
}
