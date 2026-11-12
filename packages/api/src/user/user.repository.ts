import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql, type Insertable, type Selectable, type Updateable } from 'kysely';
import { KYSELY } from '../database/database.module';
import type { Database, UsersTable } from '../database/types';

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;
export type UserRowUpdate = Updateable<UsersTable>;

export class UsernameCollisionError extends Error {
  constructor(public readonly username: string) {
    super(`Username "${username}" is already taken`);
  }
}

@Injectable()
export class UserRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  /** Case- and surrounding-whitespace-insensitive, per spec Edge Cases. */
  async findByUsername(username: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where(sql<boolean>`lower(btrim(username)) = ${this.normalize(username)}`)
      .executeTakeFirst();
  }

  async findById(id: number): Promise<UserRow | undefined> {
    return this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async create(data: NewUserRow): Promise<UserRow> {
    return this.db.transaction().execute((trx) =>
      trx.insertInto('users').values(data).returningAll().executeTakeFirstOrThrow(),
    );
  }

  async updateByUsername(
    username: string,
    data: UserRowUpdate,
  ): Promise<UserRow | undefined> {
    return this.db.transaction().execute((trx) =>
      trx
        .updateTable('users')
        .set(data)
        .where(sql<boolean>`lower(btrim(username)) = ${this.normalize(username)}`)
        .returningAll()
        .executeTakeFirst(),
    );
  }

  /**
   * Inside one transaction: rejects the whole batch if any submitted username collides
   * (case/whitespace-insensitively) with an existing account or with another entry in the
   * same batch, then inserts every row only once the batch is confirmed clean (FR-016).
   */
  async createMany(users: NewUserRow[]): Promise<UserRow[]> {
    return this.db.transaction().execute(async (trx) => {
      const normalizedUsernames = users.map((user) => this.normalize(user.username));

      const seen = new Set<string>();
      for (const username of normalizedUsernames) {
        if (seen.has(username)) {
          throw new UsernameCollisionError(username);
        }
        seen.add(username);
      }

      const existing = await trx
        .selectFrom('users')
        .select('username')
        .where(sql<boolean>`lower(btrim(username)) = ANY(${normalizedUsernames})`)
        .executeTakeFirst();
      if (existing) {
        throw new UsernameCollisionError(existing.username);
      }

      return trx.insertInto('users').values(users).returningAll().execute();
    });
  }

  async deleteByUsername(username: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const result = await trx
        .deleteFrom('users')
        .where(sql<boolean>`lower(btrim(username)) = ${this.normalize(username)}`)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    });
  }

  private normalize(username: string): string {
    return username.trim().toLowerCase();
  }
}
