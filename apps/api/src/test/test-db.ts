import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@interim/db';
import * as schema from '@interim/db';
import { drizzle } from 'drizzle-orm/pglite';

const migrations = path.resolve(__dirname, '../../../../packages/db/drizzle');

/** An in-process Postgres with the real migrations applied, so tests run the actual SQL. */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const files = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    for (const statement of readFileSync(path.join(migrations, file), 'utf8').split('--> statement-breakpoint')) {
      await client.exec(statement);
    }
  }
  // PGlite and node-postgres share Drizzle's query API; only the driver type differs.
  return drizzle(client, { schema }) as unknown as Db;
}
