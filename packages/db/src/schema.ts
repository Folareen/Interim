import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// docs/architecture.md section 5. Hard delete cascades from profile.
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at').notNull().defaultNow();

export const photoKind = pgEnum('photo_kind', [
  'front',
  'left',
  'right',
  'top',
  'full_length',
  'body',
]);
export const ledgerKind = pgEnum('ledger_kind', ['estimate', 'settle']);
export const cacheOutcome = pgEnum('cache_outcome', ['success', 'blocked', 'failed']);

export const profile = pgTable('profile', {
  id: id(),
  templateKey: text('template_key').notNull(),
  consentVersion: text('consent_version').notNull(),
  consentedAt: timestamp('consented_at').notNull(),
  judgeSample: boolean('judge_sample').notNull().default(false),
  createdAt: createdAt(),
});

export const snapshot = pgTable('snapshot', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  takenAt: timestamp('taken_at').notNull().defaultNow(),
  isBaseline: boolean('is_baseline').notNull().default(false),
  stageKey: text('stage_key'),
  captureCheck: jsonb('capture_check_json'),
  createdAt: createdAt(),
});

export const photo = pgTable('photo', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  kind: photoKind('kind').notNull(),
  s3Key: text('s3_key').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: createdAt(),
});

export const measurement = pgTable('measurement', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  value: jsonb('value_json').notNull(),
  unitsSettled: integer('units_settled').notNull().default(0),
  youcamTaskId: text('youcam_task_id'),
  createdAt: createdAt(),
});

export const render = pgTable('render', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  inputHash: text('input_hash').notNull(),
  s3Key: text('s3_key').notNull(),
  label: text('label').notNull(), // preview | earlier look
  unitsSettled: integer('units_settled').notNull().default(0),
  createdAt: createdAt(),
});

export const run = pgTable('run', {
  id: id(),
  snapshotId: uuid('snapshot_id').notNull().references(() => snapshot.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  stopReason: text('stop_reason'),
  budgetUnits: integer('budget_units').notNull(),
  spentUnits: integer('spent_units').notNull().default(0),
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

export const ledgerEntry = pgTable('ledger_entry', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').references(() => run.id, { onDelete: 'set null' }),
  tool: text('tool').notNull(),
  kind: ledgerKind('kind').notNull(),
  units: integer('units').notNull(),
  taskId: text('task_id'),
  createdAt: createdAt(),
});

export const callCache = pgTable('call_cache', {
  key: text('key').primaryKey(), // photo hash + tool + parameters hash
  outcome: cacheOutcome('outcome').notNull(),
  resultRef: text('result_ref'),
  createdAt: createdAt(),
});

export const garment = pgTable('garment', {
  id: id(),
  profileId: uuid('profile_id').notNull().references(() => profile.id, { onDelete: 'cascade' }),
  catalogSku: text('catalog_sku').notNull(),
  savedAt: timestamp('saved_at').notNull().defaultNow(),
});
