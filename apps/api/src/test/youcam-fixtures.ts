import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes a recorded task response the way `YOUCAM_MODE=record` would, for tests that run in replay. */
export async function writeYoucamFixture(
  dir: string,
  tool: string,
  key: string,
  outcome: { results: unknown } | { error: string },
  image?: Buffer,
): Promise<void> {
  const data =
    'error' in outcome
      ? { error: outcome.error, error_message: 'synthetic', results: null, task_status: 'error' }
      : { error: null, results: outcome.results, task_status: 'success' };
  await mkdir(path.join(dir, tool), { recursive: true });
  await writeFile(path.join(dir, tool, `${key}.json`), JSON.stringify({ status: 200, data }));
  if (image) await writeFile(path.join(dir, tool, `${key}.jpg`), image);
}
