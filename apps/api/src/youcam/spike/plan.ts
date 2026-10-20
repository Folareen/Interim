import { z } from 'zod';
import { unitCosts } from '../youcam.constants';
import { tools, type ToolName } from '../youcam.tools';

const toolSchema = z.custom<ToolName>((value) => typeof value === 'string' && value in tools, 'Unknown tool');

const runSchema = z
  .object({
    /** Names the run in the results and in its fixture file. */
    label: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    tool: toolSchema,
    /** One photo, for most tools. */
    photo: z.string().min(1).optional(),
    /** Front, right and left photos, for hair type. */
    photos: z.array(z.string().min(1)).length(3).optional(),
    /** A garment or hat image. */
    ref: z.string().min(1).optional(),
    /** Extra request fields, such as `template_id`. YouCam's request schema checks them. */
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((run) => (run.photo === undefined) !== (run.photos === undefined), 'Give photo or photos, not both');

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
export type Run = z.infer<typeof runSchema>;

/**
 * Builds a run's request body from the uploaded file ids. YouCam's request schema in
 * `youcam.tools.ts` validates the result before anything is sent.
 */
export function bodyFor(run: Run, photoIds: readonly string[], refId: string | undefined): Record<string, unknown> {
  const source = run.photos ? { src_file_ids: photoIds } : { src_file_id: photoIds[0] };
  return { ...source, ...(refId ? { ref_file_id: refId } : {}), ...run.params };
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
