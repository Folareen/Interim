import { defineConfig } from 'vitest/config';

// `nest build` writes to dist; never pick up anything from there.
export default defineConfig({ test: { exclude: ['dist/**', 'node_modules/**'] } });
