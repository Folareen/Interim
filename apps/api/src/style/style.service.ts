import { randomUUID } from 'node:crypto';
import { type Db, profile, run, stylePhoto, stylePreview, styleRequest, styleRequestReference } from '@interim/db';
import { STYLE_PREVIEW_UNITS, expiresAt, hasCurrentConsent, photoQualityProblem, stylePreviewPlan } from '@interim/rules';
import type {
  AddStylePhotoInput,
  CreateStyleRequestInput,
  CreateStyleUploadsInput,
  StylePhotoList,
  StyleRequestView,
  StyleSaved,
  StyleUploadsResponse,
} from '@interim/types';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { LedgerService } from '../ledger/ledger.service';
import { RUN_QUEUE, type RunQueue } from '../runs/run.queue';
import { RUNS_CONFIG, type RunsConfig } from '../runs/runs.service';
import { captureError } from '../snapshots/capture-error';
import { normalisePhoto } from '../snapshots/photo';
import { UPLOAD_CONFIG, type UploadConfig } from '../snapshots/snapshots.service';
import { StorageService } from '../storage/storage.service';

const rawKey = (profileId: string, uploadId: string) => `raw/${profileId}/${uploadId}`;
const photoKey = (profileId: string, photoId: string) => `photos/${profileId}/style/${photoId}.jpg`;

/** Style photos, preview requests and saved previews. Every lookup joins on the owner, so another person's id answers 404. */
@Injectable()
export class StyleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(RUN_QUEUE) private readonly queue: RunQueue,
    @Inject(RUNS_CONFIG) private readonly runs: RunsConfig,
    @Inject(UPLOAD_CONFIG) private readonly upload: UploadConfig,
  ) {}

  /**
   * Hands out one short lived upload link per file. Nothing is stored until `addPhoto` names the upload.
   * @throws ForbiddenException before the person has consented to the current text.
   * @throws UnprocessableEntityException with code `too_large` when a file is over `MAX_UPLOAD_BYTES`.
   */
  async createUploads(profileId: string, owner: Owner, input: CreateStyleUploadsInput): Promise<StyleUploadsResponse> {
    await this.styleProfile(profileId, owner);
    if (input.uploads.some((u) => u.sizeBytes > this.upload.maxUploadBytes)) throw captureError('too_large');
    const uploads = await Promise.all(
      input.uploads.map(async ({ sizeBytes }) => {
        const uploadId = randomUUID();
        const { url } = await this.storage.presignPut(rawKey(profileId, uploadId), sizeBytes);
        return { uploadId, method: 'PUT' as const, url };
      }),
    );
    return { uploads };
  }

  /**
   * Stores an uploaded file as a reference or current photo. The same picture added twice returns the
   * first one. A current photo must pass the light and sharpness check; a reference only needs to be readable.
   */
  async addPhoto(profileId: string, owner: Owner, input: AddStylePhotoInput) {
    const current = await this.styleProfile(profileId, owner);
    const raw = await this.storage.readCapped(rawKey(profileId, input.uploadId), this.upload.maxUploadBytes);
    if (raw === undefined) throw captureError('not_uploaded');
    if (raw === 'too_large') throw captureError('too_large');
    const normalised = await normalisePhoto(raw);
    if (input.role === 'current') {
      const problem = photoQualityProblem(normalised);
      if (problem) throw captureError(problem);
    }

    const [existing] = await this.db
      .select({ id: stylePhoto.id })
      .from(stylePhoto)
      .where(and(eq(stylePhoto.profileId, profileId), eq(stylePhoto.role, input.role), eq(stylePhoto.sha256, normalised.sha256)));
    let id = existing?.id;
    if (!id) {
      id = randomUUID();
      const objectKey = photoKey(profileId, id);
      // Stored before the row, so a failure leaves an object the cleanup job finds, never a row without a file.
      await this.storage.put(objectKey, normalised.jpeg, 'image/jpeg');
      await this.db.insert(stylePhoto).values({
        id,
        profileId,
        role: input.role,
        objectKey,
        sha256: normalised.sha256,
        expiresAt: expiresAt(current.retention, new Date()),
      });
    }
    await this.storage.delete(rawKey(profileId, input.uploadId)).catch(() => undefined);
    return { id, role: input.role, url: await this.urlOf(profileId, id) };
  }

  /** The profile's style photos, newest first. */
  async photos(profileId: string, owner: Owner): Promise<StylePhotoList> {
    await this.styleProfile(profileId, owner, false);
    const rows = await this.db
      .select({ id: stylePhoto.id, role: stylePhoto.role, key: stylePhoto.objectKey })
      .from(stylePhoto)
      .where(eq(stylePhoto.profileId, profileId))
      .orderBy(desc(stylePhoto.createdAt));
    return { photos: await Promise.all(rows.map(async (r) => ({ id: r.id, role: r.role, url: await this.storage.presignGet(r.key) }))) };
  }

  /** Deletes one photo, its file, and any request or preview that used it. */
  async removePhoto(profileId: string, photoId: string, owner: Owner): Promise<void> {
    await this.styleProfile(profileId, owner, false);
    const [row] = await this.db
      .select({ key: stylePhoto.objectKey })
      .from(stylePhoto)
      .where(and(eq(stylePhoto.id, photoId), eq(stylePhoto.profileId, profileId)));
    if (!row) throw new NotFoundException();
    const previews = await this.db
      .select({ key: stylePreview.objectKey })
      .from(stylePreview)
      .innerJoin(styleRequest, eq(styleRequest.id, stylePreview.requestId))
      .where(eq(stylePreview.referencePhotoId, photoId));
    await this.db.delete(stylePhoto).where(eq(stylePhoto.id, photoId));
    await this.storage.deleteMany([row.key, ...previews.flatMap((p) => (p.key ? [p.key] : []))]);
  }

  /**
   * Starts previews for one current photo and one to three references. The cost is checked by plain
   * rules before a run exists; asking again for the same photos returns the same request's run.
   * @param sourceHash Keyed hash of the caller's address, for the per source daily cap.
   * @throws ForbiddenException before consent, ConflictException when the budget cannot cover it.
   */
  async createRequest(profileId: string, owner: Owner, input: CreateStyleRequestInput, sourceHash: string) {
    const current = await this.styleProfile(profileId, owner);
    const ids = [input.currentPhotoId, ...input.referencePhotoIds];
    const photos = await this.db
      .select({ id: stylePhoto.id, role: stylePhoto.role })
      .from(stylePhoto)
      .where(and(eq(stylePhoto.profileId, profileId), inArray(stylePhoto.id, ids)));
    const roleOf = new Map(photos.map((p) => [p.id, p.role]));
    if (roleOf.get(input.currentPhotoId) !== 'current' || input.referencePhotoIds.some((id) => roleOf.get(id) !== 'reference'))
      throw new NotFoundException();

    const budget = Math.min(input.referencePhotoIds.length * STYLE_PREVIEW_UNITS, this.runs.runBudgetCap);
    const runId = randomUUID();
    const remaining = await this.ledger.remaining({ profileId, runId, runBudgetUnits: budget, sourceHash });
    const plan = stylePreviewPlan({
      hasCurrentConsent: current.consentCurrent,
      referenceCount: new Set(input.referencePhotoIds).size,
      remainingUnits: remaining,
    });
    if (!plan.ok) {
      if (plan.problem === 'over_budget') throw new ConflictException('The unit budget cannot cover these previews.');
      throw new UnprocessableEntityException(plan.problem);
    }

    const requestId = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(styleRequest).values({ id: requestId, profileId, currentPhotoId: input.currentPhotoId });
      await tx
        .insert(styleRequestReference)
        .values([...new Set(input.referencePhotoIds)].map((photoId, position) => ({ requestId, photoId, position })));
      await tx.insert(run).values({ id: runId, styleRequestId: requestId, budgetUnits: budget, sourceHash });
    });
    await this.queue.enqueue(runId);
    return { requestId, runId };
  }

  /** A request with its current photo and, per reference, the preview when one was made. */
  async request(requestId: string, owner: Owner): Promise<StyleRequestView> {
    const [req] = await this.db
      .select({ id: styleRequest.id, profileId: styleRequest.profileId, currentPhotoId: styleRequest.currentPhotoId, runId: run.id })
      .from(styleRequest)
      .innerJoin(profile, eq(profile.id, styleRequest.profileId))
      .innerJoin(run, eq(run.styleRequestId, styleRequest.id))
      .where(and(eq(styleRequest.id, requestId), eq(profile.ownerRef, owner.ref)));
    if (!req) throw new NotFoundException();

    const refs = await this.db
      .select({ photoId: styleRequestReference.photoId, key: stylePhoto.objectKey })
      .from(styleRequestReference)
      .innerJoin(stylePhoto, eq(stylePhoto.id, styleRequestReference.photoId))
      .where(eq(styleRequestReference.requestId, requestId))
      .orderBy(styleRequestReference.position);
    const previews = await this.db.select().from(stylePreview).where(eq(stylePreview.requestId, requestId));
    const byRef = new Map(previews.map((p) => [p.referencePhotoId, p]));

    return {
      id: req.id,
      profileId: req.profileId,
      runId: req.runId,
      currentUrl: await this.urlOf(req.profileId, req.currentPhotoId),
      items: await Promise.all(
        refs.map(async (r) => {
          const p = byRef.get(r.photoId);
          return {
            referenceId: r.photoId,
            referenceUrl: await this.storage.presignGet(r.key),
            preview: p?.objectKey ? { id: p.id, url: await this.storage.presignGet(p.objectKey), saved: p.savedAt !== null } : null,
          };
        }),
      ),
    };
  }

  /** Saves or unsaves a preview. Saving twice keeps the first time. */
  async setSaved(previewId: string, owner: Owner, saved: boolean): Promise<void> {
    const [row] = await this.db
      .select({ id: stylePreview.id, savedAt: stylePreview.savedAt })
      .from(stylePreview)
      .innerJoin(styleRequest, eq(styleRequest.id, stylePreview.requestId))
      .innerJoin(profile, eq(profile.id, styleRequest.profileId))
      .where(and(eq(stylePreview.id, previewId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    await this.db
      .update(stylePreview)
      .set({ savedAt: saved ? (row.savedAt ?? new Date()) : null })
      .where(eq(stylePreview.id, previewId));
  }

  /** The profile's saved previews, newest first. */
  async saved(profileId: string, owner: Owner): Promise<StyleSaved> {
    await this.styleProfile(profileId, owner, false);
    const rows = await this.db
      .select({
        id: stylePreview.id,
        key: stylePreview.objectKey,
        requestId: stylePreview.requestId,
        referenceKey: stylePhoto.objectKey,
      })
      .from(stylePreview)
      .innerJoin(styleRequest, eq(styleRequest.id, stylePreview.requestId))
      .innerJoin(stylePhoto, eq(stylePhoto.id, stylePreview.referencePhotoId))
      .where(and(eq(styleRequest.profileId, profileId), isNotNull(stylePreview.savedAt), isNotNull(stylePreview.objectKey)))
      .orderBy(desc(stylePreview.savedAt));
    return {
      previews: await Promise.all(
        rows.flatMap((r) =>
          r.key
            ? [
                (async () => ({
                  id: r.id,
                  url: await this.storage.presignGet(r.key as string),
                  referenceUrl: await this.storage.presignGet(r.referenceKey),
                  requestId: r.requestId,
                }))(),
              ]
            : [],
        ),
      ),
    };
  }

  // Loads an owned style profile. Situation profiles answer 409, since they have no style flow.
  private async styleProfile(profileId: string, owner: Owner, needConsent = true) {
    const [row] = await this.db
      .select({ kind: profile.kind, retention: profile.retention, consentedAt: profile.consentedAt, consentVersion: profile.consentVersion })
      .from(profile)
      .where(and(eq(profile.id, profileId), eq(profile.ownerRef, owner.ref)));
    if (!row) throw new NotFoundException();
    if (row.kind !== 'style') throw new ConflictException('This profile does not use style previews.');
    const consentCurrent = hasCurrentConsent(row);
    if (needConsent && !consentCurrent) throw new ForbiddenException('Please accept the current consent text first.');
    return { retention: row.retention, consentCurrent };
  }

  private async urlOf(profileId: string, photoId: string): Promise<string> {
    const [row] = await this.db
      .select({ key: stylePhoto.objectKey })
      .from(stylePhoto)
      .where(and(eq(stylePhoto.id, photoId), eq(stylePhoto.profileId, profileId)));
    if (!row) throw new NotFoundException();
    return this.storage.presignGet(row.key);
  }
}
