import { z } from 'zod';

export const templateKeys = [
  'weight_change',
  'midlife_change',
  'after_a_baby',
  'going_grey',
  'textured_growth',
  'beard_growth',
  'hair_loss_ahead',
] as const;
export const templateKeySchema = z.enum(templateKeys);
export type TemplateKey = z.infer<typeof templateKeySchema>;

// docs/product/spec.md section 11. Codes published in the YouCam docs; how each is handled
// lives in apps/api/src/youcam/youcam.errors.ts.
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

export const youcamModeSchema = z.enum(['live', 'record', 'replay']);
export type YoucamMode = z.infer<typeof youcamModeSchema>;

export const retentionSchema = z.enum(['standard', 'extended']);
export type Retention = z.infer<typeof retentionSchema>;

/** Body of POST /profiles. The age confirmation must be an explicit `true`. */
export const createProfileSchema = z.object({
  templateKey: templateKeySchema,
  ageConfirmed: z.literal(true),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/**
 * Body of POST /profiles/:id/consent. Each processor line is accepted separately and
 * retention has no default: the person must choose (docs/product/spec.md section 12).
 */
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

export const photoKindSchema = z.enum(['front', 'left', 'right', 'top', 'body']);
export type PhotoKind = z.infer<typeof photoKindSchema>;

/** Body of POST /profiles/:id/uploads: one presigned link per photo, sized up front so the link can pin it. */
export const createUploadsSchema = z.object({
  uploads: z.array(z.object({ kind: photoKindSchema, sizeBytes: z.number().int().positive() })).min(1).max(5),
});
export type CreateUploadsInput = z.infer<typeof createUploadsSchema>;

export const changeReportSchema = z.enum(['none', 'some', 'lot']);
export type ChangeReport = z.infer<typeof changeReportSchema>;

/** Body of POST /profiles/:id/snapshots: the uploaded photos by id, plus the check in answers. */
export const createSnapshotSchema = z.object({
  uploads: z.array(z.object({ uploadId: z.string().uuid(), kind: photoKindSchema })).min(1).max(5),
  selfReport: z
    .object({ changed: changeReportSchema, reportedSize: z.string().min(1).max(20).optional() })
    .optional(),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;

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

export const strategySchema = z.enum(['cut', 'volume', 'colour', 'cover', 'hold']);
export type Strategy = z.infer<typeof strategySchema>;

export const stageCardSchema = z.object({
  title: z.string(),
  date: z.string(),
  situationLabel: z.string(),
  stage: z.string(),
  changes: z.array(z.object({ text: z.string(), measurementId: z.string(), tool: z.string() })),
  options: z.array(
    z.object({ renderId: z.string(), reason: z.string(), label: z.literal('preview') }),
  ),
  holdOffBuying: z.array(z.object({ item: z.string(), reason: z.string() })),
  shoppingList: z.array(z.object({ sku: z.string(), size: z.string() })),
  traceSummary: z.array(z.string()),
  professionalNote: z.string().nullable(),
});
export type StageCard = z.infer<typeof stageCardSchema>;
