import type { Kysely } from 'kysely';
import type { Database } from '../src/database/types';
import { PetRepository } from '../src/pet/pet.repository';

/**
 * A maximally permissive fluent-builder mock: every method call returns the
 * same proxy except the terminal "execute" family, which resolves to a
 * generic row shape covering pets/categories/tags fields. This test only
 * verifies the transaction-wrapping contract (FR-017) — correctness of the
 * actual SQL is covered by pet.service.spec.ts (mocked repository) and
 * pet.e2e-spec.ts (real database).
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
    name: 'Rex',
    category_id: null,
    status: 'available',
    created_at: new Date(),
    updated_at: new Date(),
  });
  const executeMock = jest.fn((callback: (trx: unknown) => unknown) =>
    Promise.resolve(callback(trx)),
  );
  const transactionMock = jest.fn(() => ({ execute: executeMock }));
  const db = { transaction: transactionMock } as unknown as Kysely<Database>;
  return { db, transactionMock };
}

describe('PetRepository transaction boundaries (FR-017)', () => {
  it('wraps create() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new PetRepository(db);

    await repository.create({ name: 'Rex', photoUrls: ['https://example.com/rex.jpg'] });

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('wraps update() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new PetRepository(db);

    await repository.update({ id: 1, name: 'Rex', photoUrls: ['https://example.com/rex.jpg'] });

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('wraps delete() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new PetRepository(db);

    await repository.delete(1);

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('wraps addPhoto() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new PetRepository(db);

    await repository.addPhoto(1, 'https://example.com/new.jpg');

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
