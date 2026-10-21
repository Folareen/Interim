import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalisePhoto } from '../../snapshots/photo';
import { YoucamClient, type TaskRef, type TaskStatus } from '../youcam.client';
import { YoucamError } from '../youcam.errors';
import { unitCosts, usdPerUnit } from '../youcam.constants';
import type { ToolName, ToolRequest, ToolResult } from '../youcam.tools';
import { bodyFor, estimateUnits, manifestSchema, maxUnitsFrom, resultRowSchema, spendProblem, type Run } from './plan';

// The live spike (docs/product/spec.md section 17). Usage is in docs/integrations/youcam.md. Output
// goes to apps/api/.spike, which git ignores, so real photos and responses cannot be committed.

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

// Processes a photo the way the app stores it, so the spike sends what production would.
async function loadPhoto(file: string, base: string) {
  const photo = await normalisePhoto(await readFile(path.resolve(base, file)));
  return { bytes: photo.jpeg, hash: photo.sha256, contentType: 'image/jpg' as const, fileName: `${photo.sha256.slice(0, 12)}.jpg` };
}

// Named by what was sent, so the same call in a later run overwrites the same fixture.
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

// Result links are signed and expire in about two hours.
function imageUrl(result: ToolResult<ToolName>): string | undefined {
  return 'url' in result ? result.url : undefined;
}

async function saveRender(label: string, result: ToolResult<ToolName>) {
  const url = imageUrl(result);
  if (!url) return;
  const response = await fetch(url);
  if (!response.ok) return console.error(`${label}: the render download failed with ${response.status}`);
  await mkdir(path.join(spikeDir, 'renders'), { recursive: true });
  await writeFile(path.join(spikeDir, 'renders', `${label}.jpg`), Buffer.from(await response.arrayBuffer()));
}

// Polling is free, and a task stays readable for 24 hours.
async function renders(filter: string | undefined) {
  const client = liveClient();
  const lines = (await readFile(path.join(spikeDir, 'results.jsonl'), 'utf8')).split('\n').filter(Boolean);
  for (const line of lines) {
    const row = resultRowSchema.parse(JSON.parse(line));
    if (row.state !== 'success' || !row.taskId || !row.fixture || (filter && !row.label.includes(filter))) continue;
    const status = await client.getTask({ tool: row.tool, fixtureKey: row.fixture, taskId: row.taskId });
    if (status.state === 'success') await saveRender(row.label, status.result);
  }
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

async function batch(manifestPath: string, flags: readonly string[]) {
  const confirmed = flags.includes('--yes');
  const maxUnits = maxUnitsFrom(flags);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const base = path.dirname(path.resolve(manifestPath));
  const estimate = estimateUnits(manifest.runs);
  for (const run of manifest.runs) console.log(`${run.label.padEnd(24)} ${run.tool.padEnd(14)} ~${unitCosts[run.tool] ?? '?'} units`);
  const dollars = (estimate.units * usdPerUnit).toFixed(2);
  console.log(`\n${manifest.runs.length} runs, about ${estimate.units} units (about $${dollars}), ${estimate.unpriced} with no confirmed cost.`);

  // Free: catches a missing or unreadable photo before any unit is spent.
  const files = new Set(manifest.runs.flatMap((run) => [...(run.photos ?? []), ...(run.photo ? [run.photo] : []), ...(run.ref ? [run.ref] : [])]));
  await Promise.all([...files].map((file) => loadPhoto(file, base)));
  console.log(`${files.size} photos read and processed.`);
  if (!confirmed) {
    console.log('Dry run: nothing was sent. Add --yes to spend units.');
    return;
  }

  const problem = spendProblem(estimate, maxUnits);
  // maxUnits is only undefined when spendProblem has already said so.
  if (problem !== undefined || maxUnits === undefined) return stop(problem ?? 'Add --max-units <n>.');

  const client = liveClient();
  await mkdir(spikeDir, { recursive: true });
  const rows: string[] = [];
  const startUnits = await client.getSpendableUnits();
  for (const run of manifest.runs) {
    const before = await client.getSpendableUnits();
    // Counts every unit the balance has lost since the start, including a run that crashed after YouCam charged it.
    if (startUnits - before + (unitCosts[run.tool] ?? 0) > maxUnits) {
      console.log(`Stopped before ${run.label}: ${startUnits - before} units spent, and the next run would pass the cap of ${maxUnits}.`);
      break;
    }
    let row: Record<string, unknown>;
    try {
      const done = await runOne(client, run, base);
      if (done.status.state === 'success') await saveRender(run.label, done.status.result);
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
    const filter = argument?.toLowerCase();
    for (const sku of await liveClient().getFeatureCosts()) {
      if (filter && !`${sku.description} ${sku.run_task_url ?? ''}`.toLowerCase().includes(filter)) continue;
      console.log(`${String(sku.amount).padStart(4)} ${sku.unit.padEnd(10)} ${sku.description}  ${sku.run_task_url ?? ''}`);
    }
  } else if (command === 'templates' && argument && flags[0]) {
    console.log(JSON.stringify(await liveClient().getTemplatePage(argument, flags[0], flags[1]), null, 1));
  } else if (command === 'renders') {
    await renders(argument);
  } else if (command === 'batch' && argument) {
    await batch(argument, flags);
  } else {
    stop('Usage: spike credit | spike costs [filter] | spike templates <feature> <version> [token] | spike renders [filter] | spike batch <manifest.json> [--yes]');
  }
}

main().catch((error: unknown) => stop(error instanceof Error ? error.message : String(error)));
