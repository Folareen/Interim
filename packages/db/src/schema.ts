import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
  s3Key: text('s3_key').notNull(),
  sha256: text('sha256').notNull(), // of the normalised file
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: createdAt(),
});

export const measurement = pgTable('measurement', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  value: jsonb('value_json').notNull(),
  youcamTaskId: text('youcam_task_id'), // cost is read from the ledger through this id
  createdAt: createdAt(),
});

export const render = pgTable('render', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  inputHash: text('input_hash').notNull(),
  s3Key: text('s3_key'), // null once the image has expired
  label: text('label').notNull(), // preview | earlier look
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: createdAt(),
});

export const run = pgTable('run', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  templateVersion: integer('template_version').notNull(),
  status: text('status').notNull(),
  stopReason: text('stop_reason'),
  budgetUnits: integer('budget_units').notNull(), // spent units are summed from the ledger
  createdAt: createdAt(),
});

export const traceEntry = pgTable('trace_entry', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => run.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  tool: text('tool').notNull(),
  inputs: jsonb('inputs_json').notNull(),
  outputsRef: text('outputs_ref'),
  costUnits: integer('cost_units').notNull().default(0),
  reason: text('reason').notNull(),
  createdAt: createdAt(),
});

export const stageCard = pgTable('stage_card', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => run.id, { onDelete: 'cascade' }),
  card: jsonb('card_json').notNull(),
  approvedAt: timestamp('approved_at'),
  createdAt: createdAt(),
});

export const youcamTask = pgTable('youcam_task', {
  id: id(), // our request id, written before the create call is sent
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => run.id, { onDelete: 'set null' }),
  tool: text('tool').notNull(),
  state: taskState('state').notNull().default('intent'),
  youcamTaskId: text('youcam_task_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: createdAt(),
});

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
  key: text('key').primaryKey(), // normalised photo hash + tool + API version + parameters hash
  outcome: cacheOutcome('outcome').notNull(),
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
