import { defineConfig } from 'vitest/config';

// `nest build` writes to dist; never pick up anything from there. Each database test file starts its
// own in-process Postgres, which takes several seconds when files run in parallel, and a test that
// shares a busy machine with them can pass the 5 second default without being slow itself.
export default defineConfig({ test: { exclude: ['dist/**', 'node_modules/**'], hookTimeout: 60_000, testTimeout: 20_000 } });
