import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Db, ledgerEntry, photo, profile, run, selfReport, snapshot, stageCard } from '@interim/db';
import { eq } from 'drizzle-orm';
import { Planner, type PlannerConfig } from '../../agent/planner';
import { AgentService } from '../../agent/agent.service';
import { LedgerService } from '../../ledger/ledger.service';
import type { ProfilesService } from '../../profiles/profiles.service';
import { normalisePhoto } from '../../snapshots/photo';
import { MemoryStorage } from '../../test/memory-storage';
import { texturedJpeg } from '../../test/photos';
import { createTestDb } from '../../test/test-db';
import { YoucamClient, type Photo, type TaskRef, type TaskStatus } from '../youcam.client';
import { unitCosts, usdPerUnit } from '../youcam.constants';
import { YoucamGateway } from '../youcam.gateway';
import type { ToolName, ToolRequest } from '../youcam.tools';
import { maxUnitsFrom } from './plan';

// Records YouCam's answers for the sample personas by running the real agent loop against an
// in-memory database and storage, so every fixture is named by the pipeline's own cache key
// (packages/fixtures/sample/README.md). Usage is in docs/integrations/youcam.md. Without `--yes`
// it is a dry run: it prices the batch from the calls that have no fixture yet and sends nothing.

const here = path.resolve(__dirname, '../../../../..');
const sampleDir = path.join(here, 'packages/fixtures/sample');
const spikeDir = path.resolve('.spike');
const fixturesDir = path.resolve(process.env.YOUCAM_FIXTURES_DIR ?? '../../packages/fixtures/youcam');
const personas = ['m', 'f'] as const;
const stages = [0, 1, 2, 3, 4] as const;

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const exists = (file: string) =>
  readFile(file).then(
    () => true,
    () => false,
  );

/**
 * Serves a call from its fixture when there is one, so nothing is paid for twice, and only goes
 * live for the rest. Uploads wait until a create really needs them. In a dry run a missing fixture
 * gets a made up success that is counted and never written.
 */
class RecordingClient {
  readonly dryCalls: ToolName[] = [];
  private readonly pending = new Map<string, Photo>();
  private lastWasReplay = true;

  constructor(
    private readonly replay: YoucamClient,
    private readonly live: YoucamClient | undefined,
    private readonly image: Buffer,
  ) {}

  /** `replay` costs the ledger nothing, so it follows the call being settled. */
  get mode() {
    return this.lastWasReplay ? 'replay' : 'record';
  }

  uploadPhoto(photo: Photo): Promise<string> {
    const id = `lazy:${this.pending.size}:${randomUUID()}`;
    this.pending.set(id, photo);
    return Promise.resolve(id);
  }

  async createTask<T extends ToolName>(tool: T, body: ToolRequest<T>, fixtureKey: string): Promise<TaskRef> {
    const recorded = await exists(path.join(fixturesDir, tool, `${fixtureKey}.json`));
    this.lastWasReplay = recorded;
    const files = [...this.pending.entries()];
    this.pending.clear();
    if (recorded) return this.replay.createTask(tool, body, fixtureKey);
    if (!this.live) {
      this.dryCalls.push(tool);
      return { tool, fixtureKey, taskId: `dry:${fixtureKey}` };
    }
    let text = JSON.stringify(body);
    for (const [id, file] of files) text = text.replace(id, await this.live.uploadPhoto(file));
    return this.live.createTask(tool, JSON.parse(text) as ToolRequest<T>, fixtureKey);
  }

  getTask<T extends ToolName>(ref: TaskRef & { tool: T }): Promise<TaskStatus<T>> {
    if (ref.taskId.startsWith('replay:')) return this.replay.getTask(ref);
    if (ref.taskId.startsWith('dry:')) return Promise.resolve(dryResult(ref.tool) as TaskStatus<T>);
    return (this.live as YoucamClient).getTask(ref);
  }

  getResultImage(ref: TaskRef, url: string): Promise<Buffer> {
    if (ref.taskId.startsWith('replay:')) return this.replay.getResultImage(ref, url);
    if (ref.taskId.startsWith('dry:')) return Promise.resolve(this.image);
    return (this.live as YoucamClient).getResultImage(ref, url);
  }
}

const goodFace = { has_face: true, area: 'good', frontal: 'good', lighting: 'good', faceangle: 'good' };
function dryResult(tool: ToolName): TaskStatus<ToolName> {
  const results: Partial<Record<ToolName, unknown>> = {
    hair_length: { hair_length: { term: 'ear length' } },
    face_shape: { faceshape: 'Oval', facialratio: { face_aspect_ratio: [1, 1.34] }, face_quality: goodFace },
    skin_tone: { color: { skin_color: '#674935' }, face_quality: goodFace },
  };
  return { state: 'success', result: results[tool] ?? { url: 'https://example.test/render.jpg' } } as TaskStatus<ToolName>;
}

async function main() {
  const yes = process.argv.includes('--yes');
  const cap = maxUnitsFrom(process.argv);
  if (cap === undefined) stop('Give a cap with --max-units <n>.');
  if (yes) {
    if (process.env.YOUCAM_MODE !== 'record') stop('Set YOUCAM_MODE=record so every response is saved as a fixture.');
    if (process.env.JUDGE_MODE_FORCE_REPLAY === 'true') stop('Set JUDGE_MODE_FORCE_REPLAY=false.');
    if (process.env.LIVE_CALLS_ENABLED !== 'true') stop('Set LIVE_CALLS_ENABLED=true to allow live calls.');
  }

  const base = { apiKey: process.env.YOUCAM_API_KEY ?? '', baseUrl: process.env.YOUCAM_BASE_URL ?? 'https://yce-api-01.makeupar.com', liveCallsEnabled: yes, fixturesDir, retryBaseMs: 2_000 };
  const replay = new YoucamClient({ ...base, mode: 'replay', liveCallsEnabled: false });
  const live = yes ? new YoucamClient({ ...base, mode: 'record' }) : undefined;
  const balanceBefore = live ? await live.getSpendableUnits() : undefined;

  const photos = new Map<string, Buffer>();
  const shas = new Map<string, string>();
  for (const persona of personas) {
    for (const stage of stages) {
      const normalised = await normalisePhoto(await readFile(path.join(sampleDir, `persona-${persona}-stage-${stage}.jpg`)));
      photos.set(`${persona}-${stage}`, normalised.jpeg);
      shas.set(`${persona}-${stage}`, normalised.sha256);
    }
  }

  const db: Db = await createTestDb();
  const storage = new MemoryStorage();
  const client = new RecordingClient(replay, live, await texturedJpeg(120, 120));
  // The ledger is the hard stop: a call that would take the batch past the cap is never reserved.
  const ledger = new LedgerService(db, { perProfile: cap, perDay: cap, perSourcePerDay: cap }, {} as ProfilesService);
  const gateway = new YoucamGateway(db, client as unknown as YoucamClient, storage.asService(), ledger, { firstPollMs: yes ? 5_000 : 0, maxPollMs: 10_000, timeoutMs: 300_000 });
  const planner: PlannerConfig = { mode: 'record', fixturesDir: path.resolve('../../packages/fixtures/planner'), canCallModel: false };
  const agent = new AgentService(db, gateway, ledger, new Planner(planner, () => Promise.reject(new Error('The model is not called here.'))));

  const rows: { persona: string; stage: number; units: number; card: boolean }[] = [];
  for (const persona of personas) {
    const profileId = randomUUID();
    await db.insert(profile).values({ id: profileId, templateKey: 'hair_loss_ahead', ownerRef: 'sample', consentVersion: '4', consentedAt: new Date(), judgeSample: true });
    for (const stage of stages) {
      const snapshotId = randomUUID();
      await db.insert(snapshot).values({ id: snapshotId, profileId, isBaseline: stage === 0, takenAt: new Date(Date.UTC(2026, 9, 1 + stage * 14)) });
      const objectKey = `photos/${profileId}/${snapshotId}/front.jpg`;
      await storage.put(objectKey, photos.get(`${persona}-${stage}`) as Buffer, 'image/jpeg');
      await db.insert(photo).values({ snapshotId, kind: 'front', objectKey, sha256: shas.get(`${persona}-${stage}`) as string, expiresAt: new Date(Date.now() + 86_400_000) });
      if (stage > 0) await db.insert(selfReport).values({ snapshotId, changed: 'some', reportedSize: null });
      const runId = randomUUID();
      await db.insert(run).values({ id: runId, snapshotId, templateKey: 'hair_loss_ahead', templateVersion: 1, budgetUnits: 50 });
      await agent.run(runId);
      const settled = (await db.select().from(ledgerEntry).where(eq(ledgerEntry.runId, runId))).filter((e) => e.kind === 'settle');
      const units = settled.reduce((sum, e) => sum + e.units, 0);
      const [card] = await db.select().from(stageCard).where(eq(stageCard.runId, runId));
      rows.push({ persona, stage, units, card: card !== undefined });
      console.log(`${persona} stage ${stage}: ${units} units, ${card ? 'card' : 'NO CARD'}`);
    }
  }

  const spent = rows.reduce((sum, r) => sum + r.units, 0);
  const dryUnits = client.dryCalls.reduce((sum, tool) => sum + (unitCosts[tool] ?? 0), 0);
  const total = yes ? spent : dryUnits;
  console.log(`\n${yes ? 'Spent' : 'Estimate'}: ${total} units, ${(total * usdPerUnit).toFixed(2)} dollars (cap ${cap} units, ${(cap * usdPerUnit).toFixed(2)} dollars).`);
  if (!yes) {
    const counts = client.dryCalls.reduce<Record<string, number>>((acc, tool) => ({ ...acc, [tool]: (acc[tool] ?? 0) + 1 }), {});
    console.log('Calls without a fixture:', counts, '\nDry run only. Nothing was sent. Add --yes to record.');
    return;
  }
  const balanceAfter = live ? await live.getSpendableUnits() : undefined;
  console.log(`Balance ${balanceBefore} -> ${balanceAfter}.`);
  await mkdir(spikeDir, { recursive: true });
  await writeFile(path.join(spikeDir, 'samples-summary.json'), `${JSON.stringify({ rows, spent, balanceBefore, balanceAfter }, null, 2)}\n`);
}

void main();
