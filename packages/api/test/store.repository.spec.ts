import type { Kysely } from 'kysely';
import type { Database } from '../src/database/types';
import { OrderRepository } from '../src/store/store.repository';

/**
 * A maximally permissive fluent-builder mock: every method call returns the
 * same proxy except the terminal "execute" family, which resolves to a
 * generic order row shape. This test only verifies the transaction-wrapping
 * contract (FR-017) — correctness of the actual SQL is covered by
 * store.service.spec.ts (mocked repository) and the pet.e2e-spec.ts order
 * scenarios (real database).
 */
function createFluentMock(terminalRow: Record<string, unknown>): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'executeTakeFirstOrThrow' || prop === 'executeTakeFirst') {
        return () => Promise.resolve(terminalRow);
      }
      if (prop === 'execute') {
        return () => Promise.resolve([]);
      }
      return () => proxy;
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

function buildMockedDb(): { db: Kysely<Database>; transactionMock: jest.Mock } {
  const trx = createFluentMock({
    id: 1,
    pet_id: 1,
    quantity: 1,
    ship_date: null,
    status: 'placed',
    complete: false,
    numDeletedRows: 1n,
  });
  const executeMock = jest.fn((callback: (trx: unknown) => unknown) =>
    Promise.resolve(callback(trx)),
  );
  const transactionMock = jest.fn(() => ({ execute: executeMock }));
  const db = { transaction: transactionMock } as unknown as Kysely<Database>;
  return { db, transactionMock };
}

describe('OrderRepository transaction boundaries (FR-017)', () => {
  it('wraps create() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new OrderRepository(db);

    await repository.create({ pet_id: 1, quantity: 1, ship_date: null, status: 'placed', complete: false });

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('wraps delete() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new OrderRepository(db);

    await repository.delete(1);

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
