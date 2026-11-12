import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { Kysely, sql } from 'kysely';
import { KYSELY } from '../database/database.module';
import type { Database } from '../database/types';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {
    super();
  }

  async check(key: string): Promise<HealthIndicatorResult> {
    try {
      await sql`select 1`.execute(this.db);
      return this.getStatus(key, true);
    } catch {
      throw new HealthCheckError('Database check failed', this.getStatus(key, false));
    }
  }
}
