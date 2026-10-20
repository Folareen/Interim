import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export * from './schema';

/** Opens a pooled Postgres connection typed with the schema. Call once at startup. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool, { schema }), pool };
}
export type Db = ReturnType<typeof createDb>['db'];
