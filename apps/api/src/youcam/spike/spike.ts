import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalisePhoto } from '../../snapshots/photo';
import { YoucamClient, type TaskRef, type TaskStatus } from '../youcam.client';
import { YoucamError } from '../youcam.errors';
import { unitCosts } from '../youcam.constants';
import type { ToolName, ToolRequest } from '../youcam.tools';
import { bodyFor, estimateUnits, manifestSchema, type Run } from './plan';

// The first-48-hours spike (docs/product/spec.md section 17), run by hand against the live API.
//   pnpm --filter @interim/api spike credit
//   pnpm --filter @interim/api spike costs
//   pnpm --filter @interim/api spike batch <manifest.json> [--yes]
// Output goes to apps/api/.spike (ignored by git): fixtures/ and results.jsonl.
// `batch` is a dry run unless --yes is given, and spends units only with all three switches set.

const pollEveryMs = 5_000;
const maxPolls = 24;
const spikeDir = path.resolve('.spike');

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

function liveClient(): YoucamClient {
  if (process.env.YOUCAM_MODE !== 'record') stop('Set YOUCAM_MODE=record so every response is saved as a fixture.');
  if (process.env.JUDGE_MODE_FORCE_REPLAY === 'true') stop('Set JUDGE_MODE_FORCE_REPLAY=false for the spike.');
  if (process.env.LIVE_CALLS_ENABLED !== 'true') stop('Set LIVE_CALLS_ENABLED=true to allow live calls.');
  return new YoucamClient({
    apiKey: process.env.YOUCAM_API_KEY ?? '',
    baseUrl: process.env.YOUCAM_BASE_URL ?? 'https://yce-api-01.makeupar.com',
    mode: 'record',
    liveCallsEnabled: true,
    fixturesDir: path.join(spikeDir, 'fixtures'),
    retryBaseMs: 2_000,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads a photo as the app would store it: orientation applied, EXIF removed, long side capped. */
async function loadPhoto(file: string, base: string) {
  const photo = await normalisePhoto(await readFile(path.resolve(base, file)));
  return { bytes: photo.jpeg, hash: photo.sha256, contentType: 'image/jpg' as const, fileName: `${photo.sha256.slice(0, 12)}.jpg` };
}

/** A fixture is named by what was sent, so the same call in a later run overwrites the same file. */
function fixtureKey(run: Run, hashes: readonly string[]): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([run.tool, hashes, run.params]))
    .digest('hex')
    .slice(0, 16);
  return `${run.label}-${digest}`;
}

async function finish(client: YoucamClient, ref: TaskRef): Promise<TaskStatus<ToolName>> {
  for (let poll = 0; poll < maxPolls; poll++) {
    const status = await client.getTask(ref);
    if (status.state !== 'running') return status;
    await sleep(pollEveryMs);
  }
  return { state: 'running' };
}

async function runOne(client: YoucamClient, run: Run, base: string) {
  const files = run.photos ?? (run.photo ? [run.photo] : []);
  const photos = await Promise.all(files.map((file) => loadPhoto(file, base)));
  const reference = run.ref ? await loadPhoto(run.ref, base) : undefined;
  const key = fixtureKey(run, [...photos.map((p) => p.hash), ...(reference ? [reference.hash] : [])]);
  const started = Date.now();

  const photoIds = await Promise.all(photos.map((p) => client.uploadPhoto(p)));
  const refId = reference ? await client.uploadPhoto(reference) : undefined;
  // The body is checked against the tool's request schema inside createTask.
  const body = bodyFor(run, photoIds, refId) as ToolRequest<ToolName>;
  const ref = await client.createTask(run.tool, body, key);
  const status = await finish(client, ref);
  return { key, taskId: ref.taskId, status, seconds: Math.round((Date.now() - started) / 1000) };
}

async function batch(manifestPath: string, confirmed: boolean) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const base = path.dirname(path.resolve(manifestPath));
  const estimate = estimateUnits(manifest.runs);
  for (const run of manifest.runs) console.log(`${run.label.padEnd(24)} ${run.tool.padEnd(14)} ~${unitCosts[run.tool] ?? '?'} units`);
  console.log(`\n${manifest.runs.length} runs, about ${estimate.units} units, ${estimate.unpriced} with no confirmed cost.`);

  // Free: catches a missing or unreadable photo before any unit is spent.
  const files = new Set(manifest.runs.flatMap((run) => [...(run.photos ?? []), ...(run.photo ? [run.photo] : []), ...(run.ref ? [run.ref] : [])]));
  await Promise.all([...files].map((file) => loadPhoto(file, base)));
  console.log(`${files.size} photos read and processed.`);
  if (!confirmed) {
    console.log('Dry run: nothing was sent. Add --yes to spend units.');
    return;
  }

  const client = liveClient();
  await mkdir(spikeDir, { recursive: true });
  const rows: string[] = [];
  for (const run of manifest.runs) {
    const before = await client.getSpendableUnits();
    let row: Record<string, unknown>;
    try {
      const done = await runOne(client, run, base);
      // The balance can lag a moment behind a finished task.
      await sleep(2_000);
      const spent = before - (await client.getSpendableUnits());
      const code = done.status.state === 'error' ? done.status.code : null;
      row = { label: run.label, tool: run.tool, state: done.status.state, code, spent, seconds: done.seconds, taskId: done.taskId, fixture: done.key };
    } catch (cause) {
      // A create that may have gone through is never repeated; the run is noted and the batch moves on.
      const kind = cause instanceof YoucamError ? cause.kind : 'exception';
      row = { label: run.label, tool: run.tool, state: 'failed', code: kind, spent: null, seconds: null, taskId: null, fixture: null };
      console.error(`${run.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    await appendFile(path.join(spikeDir, 'results.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);
    rows.push(`${String(row.label).padEnd(24)} ${String(row.state).padEnd(8)} ${String(row.code ?? '').padEnd(32)} spent ${row.spent ?? '?'}  ${row.seconds ?? '?'}s`);
    console.log(rows.at(-1));
  }
  console.log(`\nResults appended to ${path.join(spikeDir, 'results.jsonl')}`);
}

async function main() {
  const [command, argument, ...flags] = process.argv.slice(2);
  if (command === 'credit') {
    console.log(`${await liveClient().getSpendableUnits()} units can be spent`);
  } else if (command === 'costs') {
    for (const sku of await liveClient().getFeatureCosts()) {
      console.log(`${String(sku.amount).padStart(4)} ${sku.unit.padEnd(10)} ${sku.description}  ${sku.run_task_url ?? ''}`);
    }
  } else if (command === 'batch' && argument) {
    await batch(argument, flags.includes('--yes'));
  } else {
    stop('Usage: spike credit | spike costs | spike batch <manifest.json> [--yes]');
  }
}

main().catch((error: unknown) => stop(error instanceof Error ? error.message : String(error)));
