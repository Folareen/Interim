import { defineConfig } from 'vitest/config';

// `nest build` writes to dist; never pick up anything from there. Each database test file starts its
// own in-process Postgres, which takes several seconds when files run in parallel.
export default defineConfig({ test: { exclude: ['dist/**', 'node_modules/**'], hookTimeout: 60_000 } });
