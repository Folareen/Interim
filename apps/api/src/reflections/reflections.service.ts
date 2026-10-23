import { type Db, profile, reflection, safetyReview } from '@interim/db';
import { crisisCheck, hasCurrentConsent } from '@interim/rules';
import {
  type LiveLocale,
  type Reflection,
  type ReflectionCreated,
  type ReflectionSafety,
  type ReflectionsView,
  liveLocaleSchema,
} from '@interim/types';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { SafetyVerdict } from '../agent/safety-reviewer';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { decryptText, encryptText } from './reflection-crypto';
import { SAFETY_QUEUE, type SafetyQueue } from './safety.queue';

/** The 64 hex characters that encrypt saved reflections. */
export const REFLECTION_KEY = Symbol('REFLECTION_KEY');

/** Gives a verdict on a flagged reflection. Provided under `SAFETY_REVIEWER` by the agent module's reviewer. */
export interface SafetyReviewerPort {
  review(text: string, locale: LiveLocale): Promise<SafetyVerdict>;
}
export const SAFETY_REVIEWER = Symbol('SAFETY_REVIEWER');

/** Reflections a profile can save in a day, so the review queue cannot be flooded. */
export const REFLECTIONS_PER_DAY = 20;

/**
 * Saved reflections and their safety review (docs/product/spec.md sections 12 and 13). The plain
 * check decides first; a model only reads text the check flagged, and can only raise a flag.
 */
@Injectable()
export class ReflectionsService {
  private readonly log = new Logger(ReflectionsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REFLECTION_KEY) private readonly key: string,
    @Inject(SAFETY_QUEUE) private readonly queue: SafetyQueue,
    @Inject(SAFETY_REVIEWER) private readonly reviewer: SafetyReviewerPort,
  ) {}

  /**
   * Saves a reflection. The server runs the check itself and does not trust the screen's answer.
   * @throws ForbiddenException before the person has consented to the current text.
   * @throws HttpException 429 after `REFLECTIONS_PER_DAY` in a day.
   */
  async create(profileId: string, owner: Owner, text: string): Promise<ReflectionCreated> {
    const { locale } = await this.ownedProfile(profileId, owner);
    const [{ recent } = { recent: 0 }] = await this.db
      .select({ recent: sql<number>`count(*)::int` })
      .from(reflection)
      .where(and(eq(reflection.profileId, profileId), gt(reflection.createdAt, sql`now() - interval '1 day'`)));
    if (recent >= REFLECTIONS_PER_DAY) throw new HttpException('Too many reflections today', HttpStatus.TOO_MANY_REQUESTS);

    const check = crisisCheck(text, locale);
    const safety = { match: 'match', near: 'flagged', none: 'none' }[check] as ReflectionSafety;
    const saved = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(reflection)
        .values({ profileId, text: encryptText(text, this.key), locale, safety })
        .returning({ id: reflection.id, createdAt: reflection.createdAt });
      if (!row) throw new Error('Reflection insert returned no row');
      if (check === 'none') return { ...row, reviewId: undefined };
      // The exact check is enough on its own, so a match needs no model and keeps the card up.
      const [review] = await tx
        .insert(safetyReview)
        .values(check === 'match' ? { reflectionId: row.id, reason: 'match', verdict: 'concern', reviewedAt: new Date() } : { reflectionId: row.id, reason: 'near' })
        .returning({ id: safetyReview.id });
      return { ...row, reviewId: check === 'near' ? review?.id : undefined };
    });

    if (saved.reviewId) {
      // The reflection is already saved. A queue failure is retried by the worker on its next start.
      await this.queue.enqueue(saved.reviewId).catch((error: unknown) => this.log.error(`Could not queue review ${saved.reviewId}: ${errorText(error)}`));
    }
    return { reflection: { id: saved.id, text, safety, createdAt: saved.createdAt }, contacts: safety !== 'none' };
  }

  /** The profile's reflections, newest first, and whether the contacts card should show. */
  async list(profileId: string, owner: Owner): Promise<ReflectionsView> {
    await this.ownedProfile(profileId, owner);
    const rows = await this.db
      .select({
        id: reflection.id,
        text: reflection.text,
        safety: reflection.safety,
        createdAt: reflection.createdAt,
        verdict: safetyReview.verdict,
        dismissedAt: safetyReview.dismissedAt,
      })
      .from(reflection)
      .leftJoin(safetyReview, eq(safetyReview.reflectionId, reflection.id))
      .where(eq(reflection.profileId, profileId))
      .orderBy(desc(reflection.createdAt));
    const reflections: Reflection[] = [];
    for (const row of rows) {
      try {
        reflections.push({ id: row.id, text: decryptText(row.text, this.key), safety: row.safety, createdAt: row.createdAt });
      } catch {
        // One unreadable row (for example after a key change) must not hide the rest.
        this.log.error(`Reflection ${row.id} could not be decrypted`);
      }
    }
    const contacts = rows.some((row) => row.verdict !== null && row.verdict !== 'clear' && row.dismissedAt === null);
    return { reflections, contacts };
  }

  /** Deletes one reflection with its review row. */
  async remove(profileId: string, reflectionId: string, owner: Owner): Promise<void> {
    await this.ownedProfile(profileId, owner);
    const deleted = await this.db
      .delete(reflection)
      .where(and(eq(reflection.id, reflectionId), eq(reflection.profileId, profileId)))
      .returning({ id: reflection.id });
    if (deleted.length === 0) throw new NotFoundException();
  }

  /** The person closed the contacts card. A later reflection that is flagged shows it again. */
  async dismissContacts(profileId: string, owner: Owner): Promise<void> {
    await this.ownedProfile(profileId, owner);
    const mine = this.db.select({ id: reflection.id }).from(reflection).where(eq(reflection.profileId, profileId));
    await this.db
      .update(safetyReview)
      .set({ dismissedAt: new Date() })
      .where(and(isNull(safetyReview.dismissedAt), inArray(safetyReview.reflectionId, mine)));
  }

  /** Every reflection with its text, for the person's export. */
  async forExport(profileId: string, owner: Owner): Promise<Reflection[]> {
    const { reflections } = await this.list(profileId, owner);
    return reflections;
  }

  /**
   * Runs the model review for one queued flag and stores its verdict. Safe to run twice: only a
   * review still pending is written, and the model can never turn a match into `clear`.
   */
  async review(reviewId: string): Promise<void> {
    const [row] = await this.db
      .select({ verdict: safetyReview.verdict, reason: safetyReview.reason, text: reflection.text, locale: reflection.locale })
      .from(safetyReview)
      .innerJoin(reflection, eq(reflection.id, safetyReview.reflectionId))
      .where(eq(safetyReview.id, reviewId));
    if (!row || row.verdict !== 'pending' || row.reason === 'match') return;

    let verdict: SafetyVerdict;
    try {
      verdict = await this.reviewer.review(decryptText(row.text, this.key), liveLocaleSchema.parse(row.locale));
    } catch (error) {
      this.log.error(`Review ${reviewId} failed: ${errorText(error)}`);
      verdict = 'unsure';
    }
    await this.db
      .update(safetyReview)
      .set({ verdict, reviewedAt: new Date() })
      .where(and(eq(safetyReview.id, reviewId), eq(safetyReview.verdict, 'pending'), ne(safetyReview.reason, 'match')));
  }

  /** Reviews still waiting, so the worker can queue any that were lost before it started. */
  async pendingReviewIds(): Promise<string[]> {
    const rows = await this.db.select({ id: safetyReview.id }).from(safetyReview).where(eq(safetyReview.verdict, 'pending'));
    return rows.map((row) => row.id);
  }

  private async ownedProfile(profileId: string, owner: Owner) {
    const [row] = await this.db
      .select({ locale: profile.locale, consentedAt: profile.consentedAt, consentVersion: profile.consentVersion })
      .from(profile)
      .where(and(eq(profile.id, profileId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    if (!hasCurrentConsent(row)) throw new ForbiddenException('Please accept the current consent text first.');
    return { locale: liveLocaleSchema.parse(row.locale) };
  }
}

// Messages never include the text of a reflection, only what went wrong.
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
