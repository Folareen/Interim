import { z } from 'zod';
import { unitCosts } from '../youcam.constants';
import { tools, type ToolName } from '../youcam.tools';

const toolSchema = z.custom<ToolName>((value) => typeof value === 'string' && value in tools, 'Unknown tool');

const runSchema = z
  .object({
    /** Names the run in the results and in its fixture file. */
    label: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    tool: toolSchema,
    photo: z.string().min(1).optional(),
    /** One to three photos, as `src_file_ids`: front, right and left for hair type, or the sources of an image edit. */
    photos: z.array(z.string().min(1)).min(1).max(3).optional(),
    /** A garment image. */
    ref: z.string().min(1).optional(),
    /** Extra request fields, such as `template_id`. YouCam's request schema checks them. */
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((run) => run.photo === undefined || run.photos === undefined, 'Give photo or photos, not both');

/** One line of `results.jsonl`, as the runner wrote it. */
export const resultRowSchema = z.object({
  label: z.string(),
  tool: toolSchema,
  state: z.string(),
  taskId: z.string().nullable(),
  fixture: z.string().nullable(),
});

/** A list of YouCam calls to run in order, read from a JSON file (docs/integrations/youcam.md, Spike runner). */
export const manifestSchema = z.object({ runs: z.array(runSchema).min(1) });

/** One YouCam call in a manifest. */
export type Run = z.infer<typeof runSchema>;

/**
 * Builds a run's request body from the uploaded file ids. YouCam's request schema in
 * `youcam.tools.ts` validates the result before anything is sent.
 */
export function bodyFor(run: Run, photoIds: readonly string[], refId: string | undefined): Record<string, unknown> {
  // A text to image run has no photo at all.
  let source = {};
  if (run.photos) source = { src_file_ids: photoIds };
  else if (run.photo) source = { src_file_id: photoIds[0] };
  return { ...source, ...(refId ? { ref_file_id: refId } : {}), ...run.params };
}

/** Reads `--max-units <n>` from the command line flags. */
export function maxUnitsFrom(flags: readonly string[]): number | undefined {
  const at = flags.indexOf('--max-units');
  const value = at === -1 ? undefined : Number(flags[at + 1]);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Why a batch may not spend units, or undefined when it may. Spending needs a cap the person set,
 * a known price for every run, and an estimate that fits under the cap.
 */
export function spendProblem(estimate: { units: number; unpriced: number }, maxUnits: number | undefined): string | undefined {
  if (maxUnits === undefined) return 'Add --max-units <n>, the most this batch may spend. Nothing was sent.';
  if (estimate.unpriced > 0) return 'A run has no confirmed price, so its cost cannot be capped. Nothing was sent.';
  if (estimate.units > maxUnits) return `The estimate (${estimate.units} units) is over the cap (${maxUnits}). Nothing was sent.`;
  return undefined;
}

/** Units the runs are expected to spend. Tools with no confirmed cost are counted apart. */
export function estimateUnits(runs: readonly Run[]): { units: number; unpriced: number } {
  let units = 0;
  let unpriced = 0;
  for (const run of runs) {
    const cost = unitCosts[run.tool];
    if (cost === undefined || cost === null) unpriced += 1;
    else units += cost;
  }
  return { units, unpriced };
}
