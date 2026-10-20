import { createDb } from '@interim/db';
import { Global, Module } from '@nestjs/common';
import { env } from '../config/env';
import { DB } from './db.token';

@Global()
@Module({
  providers: [{ provide: DB, useFactory: () => createDb(env.DATABASE_URL).db }],
  exports: [DB],
})
export class DbModule {}
