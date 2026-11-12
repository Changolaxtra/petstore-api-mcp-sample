import { Inject, Injectable } from '@nestjs/common';
import type { Insertable, Kysely, Selectable } from 'kysely';
import { KYSELY } from '../database/database.module';
import type { Database, StoreOrdersTable } from '../database/types';

export type OrderRow = Selectable<StoreOrdersTable>;
export type NewOrderRow = Insertable<StoreOrdersTable>;

@Injectable()
export class OrderRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  /** Throws the underlying FK-violation error (code `23503`) if `pet_id` doesn't exist. */
  async create(data: NewOrderRow): Promise<OrderRow> {
    return this.db.transaction().execute((trx) =>
      trx.insertInto('store_orders').values(data).returningAll().executeTakeFirstOrThrow(),
    );
  }

  async findById(id: number): Promise<OrderRow | undefined> {
    return this.db
      .selectFrom('store_orders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async delete(id: number): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const result = await trx.deleteFrom('store_orders').where('id', '=', id).executeTakeFirst();
      return result.numDeletedRows > 0n;
    });
  }

  async getInventory(): Promise<Record<string, number>> {
    const rows = await this.db
      .selectFrom('pets')
      .select(['status'])
      .select((eb) => eb.fn.countAll().as('count'))
      .groupBy('status')
      .execute();

    const inventory: Record<string, number> = {};
    for (const row of rows) {
      inventory[row.status] = Number(row.count);
    }
    return inventory;
  }
}
