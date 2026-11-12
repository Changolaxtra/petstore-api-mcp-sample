import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql, type Insertable, type Selectable, type Updateable } from 'kysely';
import { KYSELY } from '../database/database.module';
import type { Database, UsersTable } from '../database/types';

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;
export type UserRowUpdate = Updateable<UsersTable>;

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
    return this.db.insertInto('users').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateByUsername(
    username: string,
    data: UserRowUpdate,
  ): Promise<UserRow | undefined> {
    return this.db
      .updateTable('users')
      .set(data)
      .where(sql<boolean>`lower(btrim(username)) = ${this.normalize(username)}`)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteByUsername(username: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('users')
      .where(sql<boolean>`lower(btrim(username)) = ${this.normalize(username)}`)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  private normalize(username: string): string {
    return username.trim().toLowerCase();
  }
}
