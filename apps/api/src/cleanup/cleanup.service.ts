import { type Db, authToken, deletionRequest, photo, profile, rateLimit, render, session } from '@interim/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, gt, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { DB } from '../db/db.token';
import { type StoredObject, StorageService } from '../storage/storage.service';

const BATCH = 500;
const HOUR_MS = 60 * 60 * 1000;
// A raw upload waits for the person to finish the wizard; a stored photo only waits for its row.
const RAW_GRACE_MS = 24 * HOUR_MS;
const PHOTO_GRACE_MS = HOUR_MS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What one cleanup sweep did. */
export interface CleanupReport {
  expiredPhotos: number;
  expiredRenders: number;
  orphansDeleted: number;
  /** Photos whose row exists but whose file does not. Nothing can restore them. */
  missingPhotoIds: string[];
  completedDeletions: number;
  /** Expired sessions and emailed links, and rate limit windows more than a day old. */
  purgedSignInRows: number;
}

/**
 * Enforces retention and reconciles the bucket with the database (architecture sections 5 and 8).
 * Every step is safe to repeat: queue delivery is at least once.
 */
@Injectable()
export class CleanupService {
  private readonly log = new Logger(CleanupService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async run(now = new Date()): Promise<CleanupReport> {
    const expiredPhotos = await this.expirePhotos(now);
    const expiredRenders = await this.expireRenders(now);
    const { orphansDeleted, missingPhotoIds } = await this.reconcileBucket(now);
    // Deletion requests hold no profile reference, so they are completed as a group: any request
    // made before this run started has had its objects swept by now.
    const completedDeletions = await this.completeDeletions(now);
    const purgedSignInRows = await this.purgeSignIn(now);

    if (missingPhotoIds.length > 0) this.log.warn(`Photos with missing files: ${missingPhotoIds.join(', ')}`);
    return { expiredPhotos, expiredRenders, orphansDeleted, missingPhotoIds, completedDeletions, purgedSignInRows };
  }

  /** Deletes the file first, then the row, so a failed delete is retried on the next run. */
  private async expirePhotos(now: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.db
        .select({ id: photo.id, key: photo.objectKey })
        .from(photo)
        .where(lte(photo.expiresAt, now))
        .limit(BATCH);
      if (batch.length === 0) return total;
      await this.storage.deleteMany(batch.map((p) => p.key));
      await this.db.delete(photo).where(inArray(photo.id, batch.map((p) => p.id)));
      total += batch.length;
    }
  }

  /** A render that expires keeps its card text and trace but not its image (spec section 12). */
  private async expireRenders(now: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.db
        .select({ id: render.id, key: render.objectKey })
        .from(render)
        .where(and(lte(render.expiresAt, now), isNotNull(render.objectKey)))
        .limit(BATCH);
      if (batch.length === 0) return total;
      await this.storage.deleteMany(batch.flatMap((r) => (r.key ? [r.key] : [])));
      await this.db.update(render).set({ objectKey: null }).where(inArray(render.id, batch.map((r) => r.id)));
      total += batch.length;
    }
  }

  /**
   * Walks the bucket once. Objects of profiles that no longer exist go at once; unreferenced
   * objects of live profiles go after a grace period so uploads in flight are not touched.
   * Then every stored photo row is checked against what the walk saw.
   */
  private async reconcileBucket(now: Date) {
    const inBucket = new Set<string>();
    let orphansDeleted = 0;

    for (const [prefix, graceMs] of [
      ['raw/', RAW_GRACE_MS],
      ['photos/', PHOTO_GRACE_MS],
    ] as const) {
      for await (const page of this.storage.list(prefix)) {
        const orphans = await this.findOrphans(page, graceMs, now);
        if (orphans.length > 0) await this.storage.deleteMany(orphans);
        orphansDeleted += orphans.length;
        const gone = new Set(orphans);
        page.forEach((o) => !gone.has(o.key) && inBucket.add(o.key));
      }
    }

    const settled = new Date(now.getTime() - PHOTO_GRACE_MS);
    const missingPhotoIds: string[] = [];
    let after: string | undefined;
    for (;;) {
      const rows = await this.db
        .select({ id: photo.id, key: photo.objectKey })
        .from(photo)
        .where(and(lte(photo.createdAt, settled), after ? gt(photo.id, after) : undefined))
        .orderBy(asc(photo.id))
        .limit(1000);
      const last = rows.at(-1);
      if (!last) break;
      rows.forEach((row) => !inBucket.has(row.key) && missingPhotoIds.push(row.id));
      after = last.id;
    }
    return { orphansDeleted, missingPhotoIds };
  }

  /** Keys are `<prefix><profileId>/...`. Anything that does not match that layout is left alone. */
  private async findOrphans(page: StoredObject[], graceMs: number, now: Date): Promise<string[]> {
    const profileIdOf = (key: string) => key.split('/')[1] ?? '';
    const ids = [...new Set(page.map((o) => profileIdOf(o.key)).filter((id) => UUID.test(id)))];
    if (ids.length === 0) return [];

    const alive = new Set(
      (await this.db.select({ id: profile.id }).from(profile).where(inArray(profile.id, ids))).map((r) => r.id),
    );
    const referenced = new Set(
      (
        await this.db
          .select({ key: photo.objectKey })
          .from(photo)
          .where(inArray(photo.objectKey, page.map((o) => o.key)))
      ).map((r) => r.key),
    );
    return page
      .filter((o) => {
        const id = profileIdOf(o.key);
        if (!UUID.test(id)) return false;
        if (!alive.has(id)) return true;
        return !referenced.has(o.key) && now.getTime() - o.lastModified.getTime() > graceMs;
      })
      .map((o) => o.key);
  }

  private async completeDeletions(now: Date): Promise<number> {
    const done = await this.db
      .update(deletionRequest)
      .set({ completedAt: now })
      .where(and(isNull(deletionRequest.completedAt), lte(deletionRequest.requestedAt, now)))
      .returning({ id: deletionRequest.id });
    return done.length;
  }

  private async purgeSignIn(now: Date): Promise<number> {
    const sessions = await this.db.delete(session).where(lte(session.expiresAt, now)).returning({ id: session.id });
    const links = await this.db.delete(authToken).where(lte(authToken.expiresAt, now)).returning({ id: authToken.id });
    const windows = await this.db
      .delete(rateLimit)
      .where(lte(rateLimit.windowStart, new Date(now.getTime() - 24 * HOUR_MS)))
      .returning({ key: rateLimit.key });
    return sessions.length + links.length + windows.length;
  }
}
