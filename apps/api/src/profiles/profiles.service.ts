import { type Db, consentEvent, deletionRequest, photo, profile, render, snapshot } from '@interim/db';
import { CONSENT_VERSION, expiresAt, hasCurrentConsent } from '@interim/rules';
import { templates, wordsForDay } from '@interim/templates';
import { liveLocaleSchema } from '@interim/types';
import type { ConsentRequest, CreateProfileInput, Preferences, Retention } from '@interim/types';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { StorageService } from '../storage/storage.service';

// owner_ref is a credential hash and never leaves the API. words_set can imply a religion, so it
// is only read through the preferences, words and export paths.
const visible = {
  id: profile.id,
  templateKey: profile.templateKey,
  consentVersion: profile.consentVersion,
  consentedAt: profile.consentedAt,
  retention: profile.retention,
  locale: profile.locale,
  tone: profile.tone,
  bodyPhotos: profile.bodyPhotos,
  judgeSample: profile.judgeSample,
  createdAt: profile.createdAt,
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
      .values({
        templateKey: input.templateKey,
        ownerRef: owner.ref,
        consentVersion: CONSENT_VERSION,
        bodyPhotos: templates[input.templateKey].bodyPhotosByDefault,
      })
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
   * Records a consent grant or withdrawal. A grant for an outdated text is refused so the person
   * always sees the current one.
   * @throws ConflictException when a grant names a version other than the current one.
   */
  async consent(id: string, owner: Owner, input: ConsentRequest) {
    if (input.action === 'grant' && input.version !== CONSENT_VERSION) {
      throw new ConflictException(`Current consent version is ${CONSENT_VERSION}`);
    }
    const current = await this.get(id, owner);

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
      .select({ locale: profile.locale, tone: profile.tone, wordsSet: profile.wordsSet, bodyPhotos: profile.bodyPhotos })
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

  /**
   * Hard deletes the profile; foreign keys cascade. Its files go straight away, and the cleanup
   * sweep removes anything this misses and then completes the deletion request.
   */
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
      this.storage.deletePrefix(`raw/${id}/`),
    ]);
  }

  /**
   * Switching retention changes when existing files expire (spec section 12). Standard counts 30
   * days from each capture date; keep history counts 24 months from the last check in.
   */
  private async reapplyRetention(tx: Parameters<Parameters<Db['transaction']>[0]>[0], id: string, to: Retention) {
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
    // Per row, from its own snapshot's capture date.
    await tx.execute(sql`
      update ${photo} set expires_at = s.taken_at + interval '30 days'
      from ${snapshot} s where ${photo.snapshotId} = s.id and s.profile_id = ${id}`);
    await tx.execute(sql`
      update ${render} set expires_at = s.taken_at + interval '30 days'
      from ${snapshot} s where ${render.snapshotId} = s.id and s.profile_id = ${id}`);
  }

  /** Everything stored about the profile. Grows as snapshots, measurements and cards land. */
  async export(id: string, owner: Owner) {
    const current = await this.get(id, owner);
    const consentEvents = await this.db
      .select({ version: consentEvent.version, action: consentEvent.action, createdAt: consentEvent.createdAt })
      .from(consentEvent)
      .where(eq(consentEvent.profileId, id))
      .orderBy(consentEvent.createdAt);
    const preferences = await this.preferences(id, owner);
    return { exportedAt: new Date(), profile: current, preferences, consentEvents };
  }
}

function withConsentState<T extends { consentedAt: Date | null; consentVersion: string }>(row: T) {
  return { ...row, consentCurrent: hasCurrentConsent(row) };
}
