import { randomUUID } from 'node:crypto';
import { type Db, photo, profile, render, selfReport, snapshot } from '@interim/db';
import { expiresAt, photoQualityProblem, photoSetProblem, selfReportProblem } from '@interim/rules';
import { templates } from '@interim/templates';
import {
  type CreateSnapshotInput,
  type CreateUploadsInput,
  type PhotoKind,
  templateKeySchema,
} from '@interim/types';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { count, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.token';
import type { Owner } from '../guard/owner.service';
import { ProfilesService } from '../profiles/profiles.service';
import { StorageService } from '../storage/storage.service';
import { CaptureError, captureError } from './capture-error';
import { normalisePhoto } from './photo';

/** Upload limits, provided by the module from the environment. */
export interface UploadConfig {
  maxUploadBytes: number;
}
export const UPLOAD_CONFIG = Symbol('UPLOAD_CONFIG');

const rawKey = (profileId: string, uploadId: string) => `raw/${profileId}/${uploadId}`;
const photoKey = (profileId: string, snapshotId: string, kind: string) =>
  `photos/${profileId}/${snapshotId}/${kind}.jpg`;

/** Presigned uploads, server side photo checks and snapshot storage (architecture section 4). */
@Injectable()
export class SnapshotsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfig,
  ) {}

  /**
   * Hands out one short-lived upload link per photo. Nothing is stored yet: the raw file lands
   * under `raw/` and becomes a photo only when a snapshot names its upload id.
   * @throws ForbiddenException before the person has consented to the current text.
   * @throws UnprocessableEntityException with code `too_large` when a photo is over `MAX_UPLOAD_BYTES`.
   */
  async createUploads(profileId: string, owner: Owner, input: CreateUploadsInput) {
    await this.requireConsent(profileId, owner);
    const tooLarge = input.uploads.find((u) => u.sizeBytes > this.config.maxUploadBytes);
    if (tooLarge) throw captureError('too_large', tooLarge.kind);
    const uploads = await Promise.all(
      input.uploads.map(async ({ kind, sizeBytes }) => {
        const uploadId = randomUUID();
        const link = await this.storage.presignPut(rawKey(profileId, uploadId), sizeBytes);
        return { uploadId, kind, method: 'PUT' as const, ...link };
      }),
    );
    return { uploads };
  }

  /**
   * Turns uploaded files into a stored snapshot: checks the photo set and self report, normalises
   * every photo and checks its light and sharpness, stores the JPEGs and rows together, then
   * deletes the raw uploads. A photo that fails a check is refused before anything is stored, so
   * no YouCam call can follow it (docs/product/spec.md section 16, test 1).
   * @throws UnprocessableEntityException with a `CaptureProblemBody` when anything is missing or unusable.
   */
  async create(profileId: string, owner: Owner, input: CreateSnapshotInput) {
    const current = await this.requireConsent(profileId, owner);
    const template = templates[templateKeySchema.parse(current.templateKey)];

    const [{ existing } = { existing: 0 }] = await this.db
      .select({ existing: count() })
      .from(snapshot)
      .where(eq(snapshot.profileId, profileId));
    const context = { isBaseline: existing === 0, usesFit: template.usesFit, bodyPhotos: current.bodyPhotos };

    const problem =
      photoSetProblem(input.uploads.map((u) => u.kind), context) ??
      selfReportProblem(input.selfReport, context);
    if (problem) throw captureError(problem);

    const normalised = await Promise.all(
      input.uploads.map(async ({ uploadId, kind }) => {
        const raw = await this.storage.readCapped(rawKey(profileId, uploadId), this.config.maxUploadBytes);
        if (raw === undefined) throw captureError('not_uploaded', kind);
        if (raw === 'too_large') throw captureError('too_large', kind);
        return { uploadId, kind, photo: await normaliseFor(kind, raw) };
      }),
    );

    const snapshotId = randomUUID();
    const takenAt = new Date();
    const photoExpiry = expiresAt(current.retention, takenAt);
    // Written before the rows: a failure leaves orphaned objects that the cleanup job finds by
    // comparing stored keys with the bucket, never rows that point at missing files.
    await Promise.all(
      normalised.map(({ kind, photo: p }) => this.storage.put(photoKey(profileId, snapshotId, kind), p.jpeg, 'image/jpeg')),
    );

    await this.db.transaction(async (tx) => {
      // Serialises concurrent check ins so only one snapshot can be the baseline.
      await tx.select({ id: profile.id }).from(profile).where(eq(profile.id, profileId)).for('update');
      const [{ now } = { now: 0 }] = await tx
        .select({ now: count() })
        .from(snapshot)
        .where(eq(snapshot.profileId, profileId));
      if ((now === 0) !== context.isBaseline) throw new ConflictException('Another check in was just saved. Try again.');

      if (current.retention === 'extended') {
        // Every new check in restarts the 24 months for the whole profile (spec section 12).
        const profileSnapshots = tx.select({ id: snapshot.id }).from(snapshot).where(eq(snapshot.profileId, profileId));
        await tx.update(photo).set({ expiresAt: photoExpiry }).where(inArray(photo.snapshotId, profileSnapshots));
        await tx.update(render).set({ expiresAt: photoExpiry }).where(inArray(render.snapshotId, profileSnapshots));
      }

      await tx.insert(snapshot).values({
        id: snapshotId,
        profileId,
        takenAt,
        isBaseline: context.isBaseline,
        moment: input.moment ?? null,
        captureCheck: {
          source: 'server',
          photos: normalised.map(({ kind, photo: p }) => ({
            kind,
            format: p.format,
            width: p.width,
            height: p.height,
            meanLuma: Math.round(p.meanLuma),
            sharpness: Math.round(p.sharpness),
          })),
        },
      });
      await tx.insert(photo).values(
        normalised.map(({ kind, photo: p }) => ({
          snapshotId,
          kind,
          objectKey: photoKey(profileId, snapshotId, kind),
          sha256: p.sha256,
          expiresAt: photoExpiry,
        })),
      );
      if (input.selfReport) {
        await tx.insert(selfReport).values({
          snapshotId,
          changed: input.selfReport.changed,
          reportedSize: input.selfReport.reportedSize ?? null,
        });
      }
    });

    // Raw files can carry EXIF and location data, so they go as soon as the snapshot exists. A
    // failed delete is left to the cleanup job rather than failing a snapshot that was saved.
    await Promise.allSettled(normalised.map(({ uploadId }) => this.storage.delete(rawKey(profileId, uploadId))));

    return {
      id: snapshotId,
      takenAt,
      isBaseline: context.isBaseline,
      photos: normalised.map(({ kind, photo: p }) => ({ kind, sha256: p.sha256, expiresAt: photoExpiry })),
      selfReport: input.selfReport ?? null,
      moment: input.moment ?? null,
    };
  }

  private async requireConsent(profileId: string, owner: Owner) {
    const current = await this.profiles.get(profileId, owner);
    if (!current.consentCurrent) throw new ForbiddenException('Please accept the current consent text first.');
    return current;
  }
}

/** Normalises one photo and applies the quality rule, tagging any refusal with the kind of photo. */
async function normaliseFor(kind: PhotoKind, raw: Buffer) {
  try {
    const normalised = await normalisePhoto(raw);
    const problem = photoQualityProblem(normalised);
    if (problem) throw captureError(problem, kind);
    return normalised;
  } catch (error) {
    // Adds which photo failed, so the wizard can send the person back to it.
    if (error instanceof CaptureError && !error.kind) throw captureError(error.code, kind);
    throw error;
  }
}
