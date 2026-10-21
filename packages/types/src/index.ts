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

/** What `POST /profiles/:id/uploads` returns: one short lived PUT link per photo. */
export const uploadsResponseSchema = z.object({
  uploads: z.array(
    z.object({ uploadId: z.string().uuid(), kind: photoKindSchema, method: z.literal('PUT'), url: z.string().url() }),
  ),
});
export type UploadsResponse = z.infer<typeof uploadsResponseSchema>;

/** Every language Interim plans to offer (docs/product/overview.md, Languages). */
export const locales = ['en', 'fr', 'es', 'it', 'pt', 'sw', 'ha', 'yo', 'ig', 'pcm'] as const;
export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;

/**
 * The languages offered today. A language joins only with its word lists and all its copy. Catalogs
 * are typed by this list, so adding one fails the build until every catalog has it.
 */
export const liveLocales = ['en', 'fr', 'es', 'it', 'pt', 'sw', 'ha', 'yo', 'ig', 'pcm'] as const satisfies readonly Locale[];
export const liveLocaleSchema = z.enum(liveLocales);
export type LiveLocale = z.infer<typeof liveLocaleSchema>;

/**
 * The languages a native speaker has checked. The others are live but drafted, and the app says so
 * on screen until they are checked (docs/product/spec.md section 17).
 */
export const reviewedLocales = ['en'] as const satisfies readonly LiveLocale[];

/** Whether a language still ships as a draft. */
export function isDraftLocale(locale: LiveLocale): boolean {
  return !(reviewedLocales as readonly string[]).includes(locale);
}

/** How the companion talks to a profile (docs/product/overview.md, The companion). */
export const toneSchema = z.enum(['practical', 'warm', 'light']);
export type Tone = z.infer<typeof toneSchema>;

/** A profile as `GET /profiles/:id` returns it. Only the fields the app reads. */
export const profileSchema = z.object({
  id: z.string().uuid(),
  templateKey: templateKeySchema,
  consentCurrent: z.boolean(),
  retention: retentionSchema,
  tone: toneSchema,
  bodyPhotos: z.boolean(),
  /** Whether a first set of photos is already stored, so the next check in is not the baseline. */
  hasBaseline: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

/** `GET /profiles`: the caller's profiles, newest first. */
export const profileListSchema = z.array(profileSchema);

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

/** The part of `POST /profiles/:id/snapshots`'s answer the app reads. */
export const snapshotCreatedSchema = z.object({ id: z.string().uuid() });
export type SnapshotCreated = z.infer<typeof snapshotCreatedSchema>;

/** How much has changed since last time, as the person reports it. */
export const changeReportSchema = z.enum(['none', 'some', 'lot']);
export type ChangeReport = z.infer<typeof changeReportSchema>;

/** The sizes a person can report, smallest to largest, for the templates that use fit (docs/product/spec.md section 5). */
export const sizeLadder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] as const;
export const sizeSchema = z.enum(sizeLadder);
export type Size = z.infer<typeof sizeSchema>;

/** Body of POST /profiles/:id/snapshots: the uploaded photos by id, the check in answers and an optional moment. */
export const createSnapshotSchema = z.object({
  uploads: z.array(z.object({ uploadId: z.string().uuid(), kind: photoKindSchema })).min(1).max(5),
  moment: momentSchema.optional(),
  selfReport: z
    .object({ changed: changeReportSchema, reportedSize: sizeSchema.optional() })
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

/**
 * How a stage is placed from what was measured or reported (docs/product/spec.md sections 4 and 6).
 * Thresholds live in template config so they can be tuned without code changes.
 */
export type Placement =
  | {
      by: 'density';
      /** Drops in `mapping` from the person's own baseline, largest first. The first band the drop reaches names the stage. */
      bands: readonly { minDrop: number; stage: string }[];
      /** The stage once `mapping` has risen this far above the lowest reading so far. */
      recovery: { minRise: number; stage: string };
    }
  | {
      by: 'length';
      /** Hair length terms (as YouCam words them) and the stage each one places. */
      stages: Readonly<Record<string, string>>;
    }
  | {
      by: 'skin_colour';
      /** Changes in brightness from the baseline, largest first. */
      bands: readonly { minChange: number; stage: string }[];
      settled: string;
    }
  | { by: 'reported_size'; steps: readonly [string, string, string]; settled: string }
  | { by: 'reported_change' };

/** What the agent advises for a stage. */
export const strategySchema = z.enum(['cut', 'volume', 'colour', 'cover', 'hold']);
export type Strategy = z.infer<typeof strategySchema>;

/**
 * Why a photo, a photo set or an answer was refused. A code, never a sentence, so the web app can
 * say it in the person's language (docs/frontend/README.md, Copy).
 */
export const captureProblemCodes = [
  'duplicate_kind',
  'sides_baseline_only',
  'body_photos_off',
  'missing_front',
  'missing_left',
  'missing_right',
  'missing_body',
  'baseline_has_report',
  'needs_change_answer',
  'needs_size',
  'wrong_format',
  'too_large',
  'not_uploaded',
  'unreadable',
  'too_small',
  'too_dark',
  'too_bright',
  'blurry',
  'retake_angle',
  'retake_light',
  'retake_no_face',
  'retake_framing',
  'retake_other',
] as const;
export const captureProblemSchema = z.enum(captureProblemCodes);
export type CaptureProblem = z.infer<typeof captureProblemSchema>;

/** The body of a 422 from the snapshot routes. `kind` names the photo that failed, when one did. */
export const captureProblemBodySchema = z.object({
  code: captureProblemSchema,
  kind: photoKindSchema.optional(),
});
export type CaptureProblemBody = z.infer<typeof captureProblemBodySchema>;

/** What a check in asks for, from `capturePlan` in `@interim/rules`. The wizard and the server read the same rule. */
export const capturePlanSchema = z.object({
  isBaseline: z.boolean(),
  required: z.array(photoKindSchema),
  optional: z.array(photoKindSchema),
  asksChange: z.boolean(),
  asksSize: z.boolean(),
});
export type CapturePlan = z.infer<typeof capturePlanSchema>;

/** The tools that take measurements. */
export const measureTools = ['hair_type', 'hair_density', 'hair_length', 'face_shape', 'skin_tone'] as const;
export type MeasureTool = (typeof measureTools)[number];

/** The tools that make previews. */
export const renderTools = ['hairstyle', 'hair_volume', 'hair_color', 'beard_style', 'makeup_brows'] as const;
export type RenderTool = (typeof renderTools)[number];

/**
 * What the agent did at each step, as a code. The web app turns each into a short sentence in the
 * person's language, so a stored trace never holds English text.
 */
export const traceReasonSchema = z.enum([
  'observed',
  'measured',
  'reused',
  'not_due',
  'blocked_head_covering',
  'blocked_budget',
  'blocked_photo',
  'blocked_tool',
  'blocked_not_allowed',
  'retake_photo',
  'not_recorded',
  'placed_baseline',
  'placed_measured',
  'placed_reported',
  'placed_previous',
  'stage_changed',
  'strategy_chosen',
  'planner_fallback',
  'rendered',
  'earlier_look',
  'composed',
  'note_fallback',
  'stopped_complete',
  'stopped_budget',
  'stopped_ineligible',
  'stopped_retake',
  'stopped_error',
]);
export type TraceReason = z.infer<typeof traceReasonSchema>;

/** The seven steps of one run (docs/product/spec.md section 8). */
export const agentStepSchema = z.enum(['observe', 'measure', 'place', 'decide', 'act', 'compose', 'stop']);
export type AgentStep = z.infer<typeof agentStepSchema>;

/** One line of a run's trace as the API returns it. `tool` is set when the step used one. */
export const traceLineSchema = z.object({
  seq: z.number().int().nonnegative(),
  step: agentStepSchema,
  reason: traceReasonSchema,
  tool: z.string().nullable(),
  costUnits: z.number().int().nonnegative(),
});
export type TraceLine = z.infer<typeof traceLineSchema>;

/** Where a run stands. */
export const runStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);
export type RunStatus = z.infer<typeof runStatusSchema>;

/** `GET /runs/:id`, and what the progress stream sends each second. */
export const runViewSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  status: runStatusSchema,
  stopReason: traceReasonSchema.nullable(),
  retake: captureProblemSchema.nullable(),
  cardId: z.string().uuid().nullable(),
  trace: z.array(traceLineSchema),
});
export type RunView = z.infer<typeof runViewSchema>;

/** The look an option shows: a preview of a style, or an earlier render from this person's own photos. */
export const optionLabelSchema = z.enum(['preview', 'earlier_look']);
export type OptionLabel = z.infer<typeof optionLabelSchema>;

/**
 * A number on the card, as data. The web app formats it in the person's language, and the card
 * never carries digits in text the model wrote (docs/product/spec.md section 8).
 */
export const measuredValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('density'), term: z.string(), mapping: z.number() }),
  z.object({ kind: z.literal('length'), term: z.string() }),
  z.object({ kind: z.literal('hair_type'), term: z.string() }),
  z.object({ kind: z.literal('face_ratio'), ratio: z.number() }),
  z.object({ kind: z.literal('face_shape'), term: z.string() }),
  z.object({ kind: z.literal('skin_colour'), hex: z.string() }),
  z.object({ kind: z.literal('reported_size'), size: sizeSchema }),
  z.object({ kind: z.literal('reported_change'), changed: changeReportSchema }),
]);
export type MeasuredValue = z.infer<typeof measuredValueSchema>;

/** The output of a check in (docs/product/spec.md section 9). Stage and strategy are keys, never display text. */
export const stageCardSchema = z.object({
  templateKey: templateKeySchema,
  stageKey: z.string(),
  previousStageKey: z.string().nullable(),
  locale: liveLocaleSchema,
  takenAt: z.string(),
  companionNote: z.object({
    text: z.string(),
    tone: toneSchema,
    moment: momentSchema.nullable(),
    /** True when the fixed text for the tone was used because model text failed a check. */
    fixed: z.boolean(),
  }),
  changes: z.array(
    z.object({
      tool: z.string(),
      /** The measurement row, or null for a self report. */
      measurementId: z.string().uuid().nullable(),
      value: measuredValueSchema,
      measuredAt: z.string(),
      /** False when the value is from an earlier check in, so the card says "last measured on". */
      current: z.boolean(),
    }),
  ),
  options: z.array(
    z.object({
      renderId: z.string().uuid(),
      tool: z.string(),
      strategy: strategySchema,
      label: optionLabelSchema,
    }),
  ),
  holdOffBuying: z.array(z.object({ item: z.string(), reason: z.string() })),
  whatToSay: z.array(z.string()),
  trace: z.array(traceLineSchema),
  /** Shows the professional line and the link to someone to talk to. */
  sensitive: z.boolean(),
});
export type StageCard = z.infer<typeof stageCardSchema>;

/** `GET /runs/:id/card`: the card, with short lived links to the images it shows. */
export const cardViewSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  approvedAt: z.string().nullable(),
  card: stageCardSchema,
  /** Render id to link. A render that has expired has no entry. */
  renderUrls: z.record(z.string(), z.string().url()),
  /** The photo this check in was taken from, for the show my photo toggle. Null once it has expired. */
  photoUrl: z.string().url().nullable(),
});
export type CardView = z.infer<typeof cardViewSchema>;

/** `GET /profiles/:id/cards`: the profile's cards, newest first. */
export const cardSummarySchema = z.object({ id: z.string().uuid(), takenAt: z.string(), stageKey: z.string() });
export type CardSummary = z.infer<typeof cardSummarySchema>;
export const cardSummaryListSchema = z.array(cardSummarySchema);

/** An email address as sign-in uses it: trimmed, lower case, and short enough for the database. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Length only, no composition rules. The upper bound keeps hashing cheap to request (docs/product/spec.md section 12b). */
export const passwordSchema = z.string().min(10).max(128);

/** Body of POST /auth/register. `locale` is the language of the email that follows. */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  locale: liveLocaleSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Body of POST /auth/login. The password is not length checked here, so a wrong guess is a plain failure. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Body of POST /auth/magic and POST /auth/password/forgot: send a link to this address, in this language. */
export const emailLinkRequestSchema = z.object({ email: emailSchema, locale: liveLocaleSchema });
export type EmailLinkRequest = z.infer<typeof emailLinkRequestSchema>;

/** The one use token carried by an emailed link. */
export const linkTokenSchema = z.object({ token: z.string().min(20).max(200) });
export type LinkToken = z.infer<typeof linkTokenSchema>;

/** Body of POST /auth/password/reset. */
export const resetPasswordSchema = linkTokenSchema.extend({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Body of DELETE /auth/account. The password is required when the account has one. */
export const deleteAccountSchema = z.object({ password: z.string().max(128).optional() });
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** The signed in account as `GET /auth/me` returns it. */
export const meSchema = z.object({
  email: z.string(),
  hasPassword: z.boolean(),
});
export type Me = z.infer<typeof meSchema>;

/** `GET /auth/config`: which sign-in methods this deployment offers. */
export const authConfigSchema = z.object({ google: z.boolean() });
export type AuthConfig = z.infer<typeof authConfigSchema>;
