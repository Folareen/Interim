import { type Db, consentEvent, deletionRequest, garment, photo, profile, render, snapshot, stylePhoto, stylePreview, styleRequest } from '@interim/db';
import { CONSENT_VERSION, expiresAt, hasCurrentConsent } from '@interim/rules';
import { templates, wordsForDay } from '@interim/templates';
import { liveLocaleSchema } from '@interim/types';
import type { ConsentRequest, CreateProfileInput, Preferences, Retention } from '@interim/types';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { StorageService } from '../storage/storage.service';

/** Larger than any render YouCam returns, so the cap only stops a bad object. */
const MAX_RENDER_BYTES = 20 * 1024 * 1024;

// Leaves out owner_ref (a credential hash) and the columns that can imply a religion or culture
// (words_set, head_covering). Those are only read through the preferences, words and export paths.
const visible = {
  id: profile.id,
  kind: profile.kind,
  templateKey: profile.templateKey,
  consentVersion: profile.consentVersion,
  consentedAt: profile.consentedAt,
  retention: profile.retention,
  locale: profile.locale,
  tone: profile.tone,
  bodyPhotos: profile.bodyPhotos,
  judgeSample: profile.judgeSample,
  createdAt: profile.createdAt,
  // So the capture wizard knows whether the next check in is the baseline.
  hasBaseline: sql<boolean>`exists (select 1 from ${snapshot} where ${snapshot.profileId} = ${profile.id})`.as('has_baseline'),
};

/** Profile lifecycle for one owner: create, consent, read, export and hard delete. */
@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async create(owner: Owner, input: CreateProfileInput) {
    const [row] = await this.db
      .insert(profile)
      .values(
        input.kind === 'style'
          ? { kind: 'style', templateKey: null, ownerRef: owner.ref, consentVersion: CONSENT_VERSION, bodyPhotos: false }
          : {
              kind: 'situation',
              templateKey: input.templateKey,
              ownerRef: owner.ref,
              consentVersion: CONSENT_VERSION,
              bodyPhotos: templates[input.templateKey].bodyPhotosByDefault,
            },
      )
      .returning(visible);
    if (!row) throw new Error('Profile insert returned no row');
    return withConsentState(row);
  }

  async list(owner: Owner) {
    const rows = await this.db
      .select(visible)
      .from(profile)
      .where(eq(profile.ownerRef, owner.ref))
      .orderBy(desc(profile.createdAt));
    return rows.map(withConsentState);
  }

  /** Looks a profile up for its owner. Another owner's profile answers 404, not 403, so ids do not leak. */
  async get(id: string, owner: Owner) {
    const [row] = await this.db
      .select(visible)
      .from(profile)
      .where(and(eq(profile.id, id), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    return withConsentState(row);
  }

  /**
   * Records a consent grant or withdrawal.
   * @throws ConflictException when a grant names an outdated consent version, so the person always sees the current text.
   */
  async consent(id: string, owner: Owner, input: ConsentRequest) {
    if (input.action === 'grant' && input.version !== CONSENT_VERSION) {
      throw new ConflictException(`Current consent version is ${CONSENT_VERSION}`);
    }
    const current = await this.get(id, owner);
    if (input.action === 'grant' && current.kind === 'situation' && !input.acceptGemini) {
      throw new BadRequestException('Situation profiles need the Google statement accepted.');
    }

    const change =
      input.action === 'grant'
        ? { consentedAt: new Date(), consentVersion: input.version, retention: input.retention }
        : { consentedAt: null };
    await this.db.transaction(async (tx) => {
      await tx.insert(consentEvent).values({ profileId: id, version: input.version, action: input.action });
      await tx.update(profile).set(change).where(eq(profile.id, id));
      if (input.action === 'grant' && input.retention !== current.retention) {
        await this.reapplyRetention(tx, id, input.retention);
      }
    });
    return this.get(id, owner);
  }

  /** The person's companion settings, including the words for today set. */
  async preferences(id: string, owner: Owner): Promise<Preferences> {
    const [row] = await this.db
      .select({
        locale: profile.locale,
        tone: profile.tone,
        wordsSet: profile.wordsSet,
        bodyPhotos: profile.bodyPhotos,
        headCovering: profile.headCovering,
      })
      .from(profile)
      .where(and(eq(profile.id, id), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    // A language can only be stored through preferencesSchema, which accepts live locales only.
    return { ...row, locale: liveLocaleSchema.parse(row.locale) };
  }

  /** Replaces the person's companion settings. */
  async setPreferences(id: string, owner: Owner, input: Preferences): Promise<Preferences> {
    const updated = await this.db
      .update(profile)
      .set(input)
      .where(and(eq(profile.id, id), eq(profile.ownerRef, owner.ref)))
      .returning({ id: profile.id });
    if (updated.length === 0) throw new NotFoundException();
    return input;
  }

  /**
   * Today's words for the person in their language, or null while words for today is off.
   * @param date The person's local date as YYYY-MM-DD.
   */
  async words(id: string, owner: Owner, date: string) {
    const { wordsSet, locale } = await this.preferences(id, owner);
    if (!wordsSet) return { words: null };
    return { words: wordsForDay(wordsSet, date, locale) };
  }

  /** Hard deletes the profile and its files. The cleanup sweep removes anything left behind. */
  async remove(id: string, owner: Owner): Promise<void> {
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(profile)
        .where(and(eq(profile.id, id), eq(profile.ownerRef, owner.ref)))
        .returning({ id: profile.id });
      if (deleted.length === 0) throw new NotFoundException();
      // Holds no profile reference; the cleanup job marks it complete once the objects are gone.
      await tx.insert(deletionRequest).values({});
    });
    // The rows are gone, so a failed delete must not fail the request: the sweep finds the files.
    await Promise.allSettled([
      this.storage.deletePrefix(`photos/${id}/`),
      this.storage.deletePrefix(`renders/${id}/`),
      this.storage.deletePrefix(`raw/${id}/`),
    ]);
  }

  // Standard counts 30 days from each capture; keep history counts 24 months from the last check in (spec section 12).
  private async reapplyRetention(tx: Parameters<Parameters<Db['transaction']>[0]>[0], id: string, to: Retention) {
    // Style photos and previews count from when they were made, since a style profile has no check ins.
    const window = to === 'extended' ? sql`interval '24 months'` : sql`interval '30 days'`;
    await tx.execute(sql`update ${stylePhoto} set expires_at = created_at + ${window} where profile_id = ${id}`);
    await tx.execute(sql`
      update ${stylePreview} set expires_at = ${stylePreview.createdAt} + ${window}
      from ${styleRequest} r where ${stylePreview.requestId} = r.id and r.profile_id = ${id}`);

    const snapshotIds = tx.select({ id: snapshot.id }).from(snapshot).where(eq(snapshot.profileId, id));
    if (to === 'extended') {
      const [{ last } = { last: null }] = await tx
        .select({ last: max(snapshot.takenAt) })
        .from(snapshot)
        .where(eq(snapshot.profileId, id));
      if (!last) return;
      const until = expiresAt('extended', last);
      await tx.update(photo).set({ expiresAt: until }).where(inArray(photo.snapshotId, snapshotIds));
      await tx.update(render).set({ expiresAt: until }).where(inArray(render.snapshotId, snapshotIds));
      return;
    }
    await tx.execute(sql`
      update ${photo} set expires_at = s.taken_at + interval '30 days'
      from ${snapshot} s where ${photo.snapshotId} = s.id and s.profile_id = ${id}`);
    await tx.execute(sql`
      update ${render} set expires_at = s.taken_at + interval '30 days'
      from ${snapshot} s where ${render.snapshotId} = s.id and s.profile_id = ${id}`);
  }

  /** Everything stored about the profile, for the person's export. Each render has a short lived download link. */
  async export(id: string, owner: Owner) {
    const data = await this.exportData(id, owner);
    const renders = [];
    for (const { key, ...rest } of await this.renderRows(id)) {
      if (key) renders.push({ ...rest, url: await this.storage.presignGet(key) });
    }
    const stylePreviews = [];
    for (const { key, ...rest } of await this.stylePreviewRows(id)) {
      if (key) stylePreviews.push({ ...rest, url: await this.storage.presignGet(key) });
    }
    return { ...data, renders, stylePreviews };
  }

  /**
   * The export as a zip: `export.json` plus the images under `renders/`, so the person keeps the
   * renders after the download links would have expired. A render whose image cannot be read is
   * left out of the file list rather than failing the whole download.
   * @param extra Parts of the export that other modules own, such as the reflections.
   */
  async archive(id: string, owner: Owner, extra: Record<string, unknown>): Promise<Uint8Array> {
    const data = await this.exportData(id, owner);
    const files: Record<string, Uint8Array> = {};
    const renders = [];
    for (const { key, ...rest } of await this.renderRows(id)) {
      if (!key) continue;
      const image = await this.storage.readCapped(key, MAX_RENDER_BYTES);
      if (!image || image === 'too_large') continue;
      const file = `renders/${rest.id}.jpg`;
      files[file] = image;
      renders.push({ ...rest, file });
    }
    const stylePreviews = [];
    for (const { key, ...rest } of await this.stylePreviewRows(id)) {
      if (!key) continue;
      const image = await this.storage.readCapped(key, MAX_RENDER_BYTES);
      if (!image || image === 'too_large') continue;
      const file = `style-previews/${rest.id}.jpg`;
      files[file] = image;
      stylePreviews.push({ ...rest, file });
    }
    files['export.json'] = strToU8(JSON.stringify({ ...data, ...extra, renders, stylePreviews }, null, 2));
    // Images are already compressed, so storing them is faster and no bigger.
    return zipSync(files, { level: 0 });
  }

  private async exportData(id: string, owner: Owner) {
    const current = await this.get(id, owner);
    const consentEvents = await this.db
      .select({ version: consentEvent.version, action: consentEvent.action, createdAt: consentEvent.createdAt })
      .from(consentEvent)
      .where(eq(consentEvent.profileId, id))
      .orderBy(consentEvent.createdAt);
    const preferences = await this.preferences(id, owner);
    const garments = await this.db.select({ sku: garment.catalogSku, savedAt: garment.savedAt }).from(garment).where(eq(garment.profileId, id));
    return { exportedAt: new Date(), profile: current, preferences, consentEvents, garments };
  }

  /** Every style preview of the profile, newest first. `key` is null once the image has expired. */
  private stylePreviewRows(profileId: string) {
    return this.db
      .select({ id: stylePreview.id, saved: sql<boolean>`${stylePreview.savedAt} is not null`, createdAt: stylePreview.createdAt, key: stylePreview.objectKey })
      .from(stylePreview)
      .innerJoin(styleRequest, eq(styleRequest.id, stylePreview.requestId))
      .where(eq(styleRequest.profileId, profileId))
      .orderBy(desc(stylePreview.createdAt));
  }

  /** Every render of the profile, newest check in first. `key` is null once the image has expired. */
  private renderRows(profileId: string) {
    return this.db
      .select({ id: render.id, tool: render.tool, strategy: render.strategy, garmentSku: render.garmentSku, label: render.label, key: render.objectKey, takenAt: snapshot.takenAt })
      .from(render)
      .innerJoin(snapshot, eq(snapshot.id, render.snapshotId))
      .where(eq(snapshot.profileId, profileId))
      .orderBy(desc(snapshot.takenAt));
  }
}

function withConsentState<T extends { consentedAt: Date | null; consentVersion: string }>(row: T) {
  return { ...row, consentCurrent: hasCurrentConsent(row) };
}
