import { boolean, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// docs/architecture.md section 5. Hard delete cascades from profile, except the ledger,
// budget counters and deletion requests, which hold no personal data.
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at').notNull().defaultNow();

export const photoKind = pgEnum('photo_kind', ['front', 'left', 'right', 'top', 'body']);
export const ledgerKind = pgEnum('ledger_kind', ['reserve', 'settle', 'release']);
export const cacheOutcome = pgEnum('cache_outcome', ['success', 'blocked']);
export const retention = pgEnum('retention', ['standard', 'extended']);
export const consentAction = pgEnum('consent_action', ['grant', 'withdraw']);
export const changeReport = pgEnum('change_report', ['none', 'some', 'lot']);
// Every planned language, so turning one on needs no migration; the API accepts only live ones.
export const locale = pgEnum('locale', ['en', 'fr', 'es', 'it', 'pt', 'sw', 'ha', 'yo', 'ig', 'pcm']);
export const authTokenPurpose = pgEnum('auth_token_purpose', ['verify_email', 'magic_link', 'reset_password']);
export const tone = pgEnum('tone', ['practical', 'warm', 'light']);
export const wordsSet = pgEnum('words_set', ['gentle', 'christian', 'muslim', 'jewish']);
export const moment = pgEnum('moment', [
  'back_to_work',
  'family_event',
  'date',
  'photos',
  'video_call',
  'going_out',
  'everyday',
]);
export const runStatus = pgEnum('run_status', ['queued', 'running', 'done', 'failed']);
export const agentStep = pgEnum('agent_step', ['observe', 'measure', 'place', 'decide', 'act', 'compose', 'stop']);
export const strategy = pgEnum('strategy', ['cut', 'volume', 'colour', 'cover', 'hold']);
export const taskState = pgEnum('task_state', [
  'intent',
  'created',
  'polling',
  'done',
  'failed',
  'unknown',
]);

export const profile = pgTable('profile', {
  id: id(),
  templateKey: text('template_key').notNull(),
  // Hash of the owner cookie token, or `sample`.
  ownerRef: text('owner_ref').notNull(),
  consentVersion: text('consent_version').notNull(),
  consentedAt: timestamp('consented_at'), // null until the person consents
  retention: retention('retention').notNull().default('standard'),
  locale: locale('locale').notNull().default('en'),
  tone: tone('tone').notNull().default('warm'),
  // Can imply a religion: never sent to the model (docs/product/spec.md section 12).
  wordsSet: wordsSet('words_set'), // null while words for today is off
  // The person covers their hair, so hair try on never runs. Can imply a religion or culture: never
  // sent to the model (docs/product/spec.md sections 7 and 12).
  headCovering: boolean('head_covering').notNull().default(false),
  // New profiles copy the template's default; rows from before the setting existed keep body photos on.
  bodyPhotos: boolean('body_photos').notNull().default(true),
  judgeSample: boolean('judge_sample').notNull().default(false),
  createdAt: createdAt(),
});

export const consentEvent = pgTable('consent_event', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  action: consentAction('action').notNull(),
  createdAt: createdAt(),
});

export const snapshot = pgTable('snapshot', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  takenAt: timestamp('taken_at').notNull().defaultNow(),
  isBaseline: boolean('is_baseline').notNull().default(false),
  stageKey: text('stage_key'),
  moment: moment('moment'), // what the person is getting ready for, if they said
  captureCheck: jsonb('capture_check_json'),
  createdAt: createdAt(),
});

export const selfReport = pgTable('self_report', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  changed: changeReport('changed').notNull(),
  reportedSize: text('reported_size'),
  createdAt: createdAt(),
});

export const photo = pgTable('photo', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  kind: photoKind('kind').notNull(),
  objectKey: text('object_key').notNull(),
  sha256: text('sha256').notNull(), // of the normalised file
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: createdAt(),
});

export const measurement = pgTable(
  'measurement',
  {
    id: id(),
    snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    value: jsonb('value_json').notNull(),
    // False when YouCam's own read of the photo was not all good: kept, but never used to place a stage.
    reliable: boolean('reliable').notNull().default(true),
    youcamTaskId: text('youcam_task_id'), // cost is read from the ledger through this id
    createdAt: createdAt(),
  },
  // A retried job finds its measurement instead of adding a second one.
  (t) => [uniqueIndex('measurement_snapshot_tool').on(t.snapshotId, t.tool)],
);

export const render = pgTable(
  'render',
  {
    id: id(),
    snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    strategy: strategy('strategy').notNull(),
    inputHash: text('input_hash').notNull(),
    objectKey: text('object_key'), // null once the image has expired
    label: text('label').notNull(), // preview | earlier_look
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('render_snapshot_input').on(t.snapshotId, t.inputHash)],
);

export const run = pgTable(
  'run',
  {
    id: id(),
    snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
    templateKey: text('template_key').notNull(),
    templateVersion: integer('template_version').notNull(),
    status: runStatus('status').notNull().default('queued'),
    stopReason: text('stop_reason'), // a trace reason code
    retake: text('retake'), // a capture problem code, when YouCam asked for a new photo
    budgetUnits: integer('budget_units').notNull(), // spent units are summed from the ledger
    sourceHash: text('source_hash'), // keyed hash of the caller's address, for the per source daily cap
    createdAt: createdAt(),
  },
  // One run per snapshot, so starting it twice returns the same one.
  (t) => [uniqueIndex('run_snapshot').on(t.snapshotId)],
);

export const traceEntry = pgTable(
  'trace_entry',
  {
    id: id(),
    runId: uuid('run_id').notNull().references(() => run.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    step: agentStep('step').notNull(),
    tool: text('tool'), // null for a step that used none
    inputs: jsonb('inputs_json').notNull(),
    outputsRef: text('outputs_ref'),
    costUnits: integer('cost_units').notNull().default(0),
    reason: text('reason').notNull(), // a trace reason code
    createdAt: createdAt(),
  },
  // A retried job rewrites the same line instead of adding another.
  (t) => [uniqueIndex('trace_entry_run_seq').on(t.runId, t.seq)],
);

export const stageCard = pgTable(
  'stage_card',
  {
    id: id(),
    runId: uuid('run_id').notNull().references(() => run.id, { onDelete: 'cascade' }),
    // Kept beside the run so listing a profile's cards and checking who owns one is a single lookup.
    profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
    card: jsonb('card_json').notNull(),
    approvedAt: timestamp('approved_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('stage_card_run').on(t.runId)],
);

export const youcamTask = pgTable(
  'youcam_task',
  {
    id: id(), // our request id, written before the create call is sent
    profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => run.id, { onDelete: 'set null' }),
    tool: text('tool').notNull(),
    // The call's fixture key (photo hash, tool, version, parameters). A redelivered job finds its task by it.
    cacheKey: text('cache_key').notNull(),
    state: taskState('state').notNull().default('intent'),
    youcamTaskId: text('youcam_task_id'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('youcam_task_run_key').on(t.runId, t.cacheKey)],
);

// No personal data and no foreign keys, so it survives profile deletion.
export const ledgerEntry = pgTable(
  'ledger_entry',
  {
    id: id(),
    profileRef: uuid('profile_ref').notNull(),
    runId: uuid('run_id'),
    tool: text('tool').notNull(),
    kind: ledgerKind('kind').notNull(),
    units: integer('units').notNull(),
    taskId: text('task_id'), // youcam_task.id, our request id. Null task ids never collide.
    createdAt: createdAt(),
  },
  // One reserve, one settle and one release per task at most, so a retried job cannot double count.
  (t) => [uniqueIndex('ledger_entry_task_kind').on(t.taskId, t.kind)],
);

// Reserved under a row lock so concurrent runs cannot overspend a cap.
export const budgetCounter = pgTable('budget_counter', {
  scope: text('scope').primaryKey(), // run:<id> | profile:<id> | day:<date> | source:<hash>:<date>
  reservedUnits: integer('reserved_units').notNull().default(0),
  settledUnits: integer('settled_units').notNull().default(0),
});

export const callCache = pgTable('call_cache', {
  // `<profile id>:<normalised photo hash, tool, API version and parameters hash>`. The profile is part
  // of the key, so one person's result is never served to another and a deleted profile takes its rows.
  key: text('key').primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  outcome: cacheOutcome('outcome').notNull(),
  // A success holds the tool's result as JSON for a measurement, or the stored image's object key for a render.
  resultRef: text('result_ref'),
  createdAt: createdAt(),
});

export const catalogItem = pgTable('catalog_item', {
  sku: text('sku').primaryKey(),
  name: text('name').notNull(),
  sizeChart: jsonb('size_chart_json').notNull(),
});

export const garment = pgTable('garment', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  catalogSku: text('catalog_sku').notNull().references(() => catalogItem.sku),
  savedAt: timestamp('saved_at').notNull().defaultNow(),
});

export const shareLink = pgTable('share_link', {
  id: id(),
  cardId: uuid('card_id').notNull().references(() => stageCard.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: createdAt(),
});

// Holds no profile reference.
export const deletionRequest = pgTable('deletion_request', {
  id: id(),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Sign-in (docs/architecture.md section 12). A profile belongs to an account through
// `profile.owner_ref = 'account:<id>'`, so deleting an account deletes its profiles through
// `ProfilesService.remove`, which also removes their files.
export const account = pgTable('account', {
  id: id(),
  email: text('email').notNull().unique(), // stored lower case
  emailVerifiedAt: timestamp('email_verified_at'), // null until the person proves the inbox is theirs
  passwordHash: text('password_hash'), // null for accounts that only use a link or Google
  googleSub: text('google_sub').unique(),
  createdAt: createdAt(),
});

// Only the hash of the cookie token is stored, so a database leak cannot be replayed.
export const session = pgTable('session', {
  id: id(),
  accountId: uuid('account_id').notNull().references(() => account.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: createdAt(),
});

// One use links sent by email. Keyed by email, not account, because a sign-in link can create the account.
export const authToken = pgTable('auth_token', {
  id: id(),
  email: text('email').notNull(),
  purpose: authTokenPurpose('purpose').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: createdAt(),
});

// Fixed window counters for sign-in endpoints. Keys are HMACs, so no email or address is stored.
export const rateLimit = pgTable(
  'rate_limit',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start').notNull(),
    hits: integer('hits').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
