import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types as pgTypes } from 'pg';
import type { EnvConfig } from '../config/env.validation';
import type { Database } from './types';

export const KYSELY = Symbol('KYSELY');

// Parse Postgres `bigint` (OID 20, e.g. the `users.id` identity column) as a
// JS number rather than the driver's default string, matching the `number`
// type declared for it in ./types.ts. Safe for this schema's id ranges.
pgTypes.setTypeParser(20, (value: string) => parseInt(value, 10));

/** Closes the pg Pool when the module shuts down — otherwise its open
 * connections outlive the app and throw unhandled errors if the database
 * goes away first (e.g. a test container stopping). */
@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>): Kysely<Database> => {
        const dialect = new PostgresDialect({
          pool: new Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
        });
        return new Kysely<Database>({ dialect });
      },
    },
    DatabaseLifecycle,
  ],
  exports: [KYSELY],
})
export class DatabaseModule {}
