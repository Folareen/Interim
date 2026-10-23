import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

// The app reads its environment when `config/env` is first imported, which a static import does
// before the test body runs, so the values are set in a hoisted block.
vi.hoisted(() => {
  const set = (key: string, value: string) => (process.env[key] ??= value);
  set('DATABASE_URL', 'postgres://x:x@localhost:5432/x');
  set('REDIS_URL', 'redis://localhost:6379');
  set('R2_ENDPOINT', 'https://x.example.com');
  set('R2_BUCKET', 'x');
  set('R2_REGION', 'auto');
  set('R2_ACCESS_KEY_ID', 'x');
  set('R2_SECRET_ACCESS_KEY', 'x');
  set('SESSION_SECRET', 'x'.repeat(32));
  set('DATA_KEY', 'a'.repeat(64));
});

import { AppModule } from './app.module';

// Nothing else loads every module together, so an import loop between modules only shows up when
// the server starts. Nest reads each module's imports at decoration time, and a loop leaves one undefined.
describe('AppModule', () => {
  it('has no undefined module in any imports list', () => {
    const seen = new Set<unknown>();
    const walk = (module: unknown, path: string) => {
      expect(module, path).toBeDefined();
      if (seen.has(module)) return;
      seen.add(module);
      const imports: unknown[] = Reflect.getMetadata('imports', module as object) ?? [];
      imports.forEach((child, index) => walk(child, `${path} -> imports[${index}]`));
    };
    walk(AppModule, 'AppModule');
    expect(seen.size).toBeGreaterThan(10);
  });
});
