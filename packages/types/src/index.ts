import { z } from 'zod';

/** The situations, in display order: the illness-first ones come first (docs/product/overview.md, Templates). */
export const templateKeys = [
  'hair_loss_ahead',
  'hair_patches',
  'face_fullness',
  'after_surgery',
  'skin_colour',
  'weight_change',
  'midlife_change',
  'after_a_baby',
  'going_grey',
  'textured_growth',
  'beard_growth',
] as const;

/** A situation key. */
export const templateKeySchema = z.enum(templateKeys);
export type TemplateKey = z.infer<typeof templateKeySchema>;

/** Error codes YouCam documents for failed tasks. How each is handled is in `youcam.errors.ts` (docs/product/spec.md section 11). */
export const youcamErrorCodes = [
  'error_hair_too_short',
  'error_bald_image',
  'error_face_angle_invalid',
  'error_insufficient_lighting',
  'error_no_face',
  'error_large_face_angle',
  'error_multiple_people',
  'error_no_shoulder',
  'error_pose',
  'error_face_pose',
  'error_insufficient_landmarks',
  'error_face_parsing',
  'error_face_position_invalid',
  'error_face_position_too_small',
  'error_face_position_out_of_boundary',
  'error_src_face_too_small',
  'error_src_face_out_of_bound',
  'error_lighting_dark',
  'error_below_min_image_size',
  'error_exceed_max_image_size',
  'error_mismatch_image_size',
  'error_unsupport_ratio',
  'error_face_not_forward_facing',
  'error_face_angle_upward',
  'error_face_angle_downward',
  'error_face_angle_leftward',
  'error_face_angle_rightward',
  'error_face_angle_left_tilt',
  'error_face_angle_right_tilt',
  'error_invalid_ref',
  'error_apply_region_mismatch',
  'error_invalid_src',
  'error_editing_failed',
  'error_multi_person',
  'error_nsfw_content_detected',
  'exceed_nsfw_retry_limits',
  'exceed_max_filesize',
  'invalid_parameter',
  'error_download_image',
  'error_decode_image',
  'error_download_mask',
  'error_decode_mask',
  'error_inference',
  'error_upload',
  'unknown_internal_error',
] as const;
export const youcamErrorCodeSchema = z.enum(youcamErrorCodes);
export type YoucamErrorCode = z.infer<typeof youcamErrorCodeSchema>;

/** How the YouCam client runs: `live`, `record` (live, and save fixtures) or `replay` (fixtures only). */
export const youcamModeSchema = z.enum(['live', 'record', 'replay']);
export type YoucamMode = z.infer<typeof youcamModeSchema>;

/** `standard` deletes photos after 30 days; `extended` keeps them up to 24 months (docs/product/spec.md section 12). */
export const retentionSchema = z.enum(['standard', 'extended']);
export type Retention = z.infer<typeof retentionSchema>;

/** Body of POST /profiles. The age confirmation must be an explicit `true`. */
export const createProfileSchema = z.object({
  templateKey: templateKeySchema,
  ageConfirmed: z.literal(true),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/** Body of POST /profiles/:id/consent. Each processor line is accepted separately, and retention has no default (spec section 12). */
export const consentRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('grant'),
    version: z.string().min(1),
    retention: retentionSchema,
    acceptStorage: z.literal(true),
    acceptYoucam: z.literal(true),
    acceptGemini: z.literal(true),
    acceptOwnPhotosOnly: z.literal(true),
  }),
  z.object({ action: z.literal('withdraw'), version: z.string().min(1) }),
]);
export type ConsentRequest = z.infer<typeof consentRequestSchema>;

/** The photos a check in can include (docs/product/spec.md section 5). */
export const photoKindSchema = z.enum(['front', 'left', 'right', 'top', 'body']);
export type PhotoKind = z.infer<typeof photoKindSchema>;

/** Body of POST /profiles/:id/uploads: one presigned link per photo, sized up front so the link can pin it. */
export const createUploadsSchema = z.object({
  uploads: z.array(z.object({ kind: photoKindSchema, sizeBytes: z.number().int().positive() })).min(1).max(5),
});
export type CreateUploadsInput = z.infer<typeof createUploadsSchema>;

/** Every language Interim plans to offer (docs/product/overview.md, Languages). */
export const locales = ['en', 'fr', 'es', 'it', 'pt', 'sw', 'ha', 'yo', 'ig', 'pcm'] as const;
export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;

/**
 * The languages offered today. A language joins only with its reviewed word lists and all its copy.
 * Catalogs are typed by this list, so adding one fails the build until every catalog has it.
 */
export const liveLocales = ['en'] as const satisfies readonly Locale[];
export const liveLocaleSchema = z.enum(liveLocales);
export type LiveLocale = z.infer<typeof liveLocaleSchema>;

/** How the companion talks to a profile (docs/product/overview.md, The companion). */
export const toneSchema = z.enum(['practical', 'warm', 'light']);
export type Tone = z.infer<typeof toneSchema>;

/** What the person is getting ready for. A fixed list, never free text, because it reaches the model. */
export const momentSchema = z.enum([
  'back_to_work',
  'family_event',
  'date',
  'photos',
  'video_call',
  'going_out',
  'everyday',
]);
export type Moment = z.infer<typeof momentSchema>;

/** The words for today sets. A profile with none chosen has words for today off. */
export const wordsSetSchema = z.enum(['gentle', 'christian', 'muslim', 'jewish']);
export type WordsSet = z.infer<typeof wordsSetSchema>;

/**
 * Body of PUT /profiles/:id/preferences. `wordsSet` null turns words for today off; `headCovering`
 * turns hair try on off. Both can imply a religion or culture, so only the person reads or sets them (spec section 12).
 */
export const preferencesSchema = z.object({
  locale: liveLocaleSchema,
  tone: toneSchema,
  wordsSet: wordsSetSchema.nullable(),
  bodyPhotos: z.boolean(),
  headCovering: z.boolean(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Query of GET /profiles/:id/words: the person's local date, so the passage turns over at their midnight. */
export const wordsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((date) => !Number.isNaN(Date.parse(date)), 'Not a real date'),
});
export type WordsQuery = z.infer<typeof wordsQuerySchema>;

/** How much has changed since last time, as the person reports it. */
export const changeReportSchema = z.enum(['none', 'some', 'lot']);
export type ChangeReport = z.infer<typeof changeReportSchema>;

/** Body of POST /profiles/:id/snapshots: the uploaded photos by id, the check in answers and an optional moment. */
export const createSnapshotSchema = z.object({
  uploads: z.array(z.object({ uploadId: z.string().uuid(), kind: photoKindSchema })).min(1).max(5),
  moment: momentSchema.optional(),
  selfReport: z
    .object({ changed: changeReportSchema, reportedSize: z.string().min(1).max(20).optional() })
    .optional(),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;

/** One ledger row as the API returns it. */
export const ledgerEntrySchema = z.object({
  id: z.string().uuid(),
  profileRef: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  tool: z.string(),
  kind: z.enum(['reserve', 'settle', 'release']),
  units: z.number().int().nonnegative(),
  taskId: z.string().nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** What the agent advises for a stage. */
export const strategySchema = z.enum(['cut', 'volume', 'colour', 'cover', 'hold']);
export type Strategy = z.infer<typeof strategySchema>;

/** The output of a check in (docs/product/spec.md section 9). */
export const stageCardSchema = z.object({
  title: z.string(),
  date: z.string(),
  companionNote: z.object({ text: z.string(), tone: toneSchema, moment: momentSchema.nullable() }),
  situationLabel: z.string(),
  stage: z.string(),
  changes: z.array(z.object({ text: z.string(), measurementId: z.string(), tool: z.string() })),
  options: z.array(
    z.object({ renderId: z.string(), reason: z.string(), label: z.literal('preview') }),
  ),
  holdOffBuying: z.array(z.object({ item: z.string(), reason: z.string() })),
  shoppingList: z.array(z.object({ sku: z.string(), size: z.string() })),
  whatToSay: z.array(z.string()),
  traceSummary: z.array(z.string()),
  professionalNote: z.string().nullable(),
});
export type StageCard = z.infer<typeof stageCardSchema>;
