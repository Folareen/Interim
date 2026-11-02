import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export * from './schema';

/** Opens a pooled Postgres connection typed with the schema. Call once at startup. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, keepAlive: true });
  // A managed database such as Neon drops idle connections when it pauses. The pool opens a new one on
  // the next query, so the dropped one must not take the process down with an unhandled error event.
  pool.on('error', () => undefined);
  return { db: drizzle(pool, { schema }), pool };
}

/** The Drizzle client, typed with the schema. */
export type Db = ReturnType<typeof createDb>['db'];
