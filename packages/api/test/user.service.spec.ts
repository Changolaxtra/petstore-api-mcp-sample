import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../src/database/types';
import { ApiKeyStoreService } from '../src/security/api-key-store.service';
import { PasswordHasherService } from '../src/security/password-hasher.service';
import type { CreateUserDto } from '../src/user/dto/create-user.dto';
import { UserRepository, UsernameCollisionError, type UserRow } from '../src/user/user.repository';
import { UserService } from '../src/user/user.service';

function buildUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    username: 'alice',
    first_name: null,
    last_name: null,
    email: null,
    password: 'hashed-password',
    phone: null,
    user_status: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<UserRepository>;
  let hasher: jest.Mocked<PasswordHasherService>;
  let apiKeyStore: jest.Mocked<ApiKeyStoreService>;

  beforeEach(() => {
    repository = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      updateByUsername: jest.fn(),
      deleteByUsername: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    hasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    } as unknown as jest.Mocked<PasswordHasherService>;

    apiKeyStore = {
      issue: jest.fn(),
      resolve: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<ApiKeyStoreService>;

    service = new UserService(repository, hasher, apiKeyStore);
  });

  describe('create', () => {
    const dto: CreateUserDto = { username: 'alice', password: 'Str0ngPass!23' };

    it('hashes the password and creates the account when the username is free', async () => {
      repository.findByUsername.mockResolvedValue(undefined);
      hasher.hash.mockResolvedValue('hashed-password');
      repository.create.mockResolvedValue(buildUserRow());

      const result = await service.create(dto);

      expect(hasher.hash).toHaveBeenCalledWith('Str0ngPass!23');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'alice', password: 'hashed-password' }),
      );
      expect(result.username).toBe('alice');
    });

    it('rejects a username that is already taken', async () => {
      repository.findByUsername.mockResolvedValue(buildUserRow());

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('createMany', () => {
    const dtos: CreateUserDto[] = [
      { username: 'alice', password: 'Str0ngPass!23' },
      { username: 'bob', password: 'Str0ngPass!24' },
    ];

    it('hashes every password and creates the batch when it is clean', async () => {
      hasher.hash.mockImplementation((password) => Promise.resolve(`hashed-${password}`));
      repository.createMany.mockResolvedValue([
        buildUserRow({ username: 'alice' }),
        buildUserRow({ id: 2, username: 'bob' }),
      ]);

      const result = await service.createMany(dtos);

      expect(repository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({ username: 'alice', password: 'hashed-Str0ngPass!23' }),
        expect.objectContaining({ username: 'bob', password: 'hashed-Str0ngPass!24' }),
      ]);
      expect(result).toHaveLength(2);
    });

    it('maps a batch collision to ConflictException', async () => {
      hasher.hash.mockResolvedValue('hashed-password');
      repository.createMany.mockRejectedValue(new UsernameCollisionError('alice'));

      await expect(service.createMany(dtos)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated error', async () => {
      const error = new Error('connection lost');
      hasher.hash.mockResolvedValue('hashed-password');
      repository.createMany.mockRejectedValue(error);

      await expect(service.createMany(dtos)).rejects.toBe(error);
    });
  });

  describe('login', () => {
    it('issues an API key for correct credentials', async () => {
      repository.findByUsername.mockResolvedValue(buildUserRow({ id: 42 }));
      hasher.verify.mockResolvedValue(true);
      apiKeyStore.issue.mockResolvedValue('the-token');

      const token = await service.login('alice', 'correct-password');

      expect(apiKeyStore.issue).toHaveBeenCalledWith(42);
      expect(token).toBe('the-token');
    });

    it('rejects an unknown username', async () => {
      repository.findByUsername.mockResolvedValue(undefined);

      await expect(service.login('ghost', 'whatever')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(apiKeyStore.issue).not.toHaveBeenCalled();
    });

    it('rejects a wrong password with the same error as an unknown username', async () => {
      repository.findByUsername.mockResolvedValue(buildUserRow());
      hasher.verify.mockResolvedValue(false);

      await expect(service.login('alice', 'wrong-password')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(apiKeyStore.issue).not.toHaveBeenCalled();
    });
  });

  describe('getByUsername', () => {
    it('returns the account when found', async () => {
      repository.findByUsername.mockResolvedValue(buildUserRow());
      await expect(service.getByUsername('alice')).resolves.toMatchObject({ username: 'alice' });
    });

    it('throws NotFoundException when missing', async () => {
      repository.findByUsername.mockResolvedValue(undefined);
      await expect(service.getByUsername('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('returns the updated account when found', async () => {
      repository.updateByUsername.mockResolvedValue(buildUserRow({ phone: '555-0100' }));
      await expect(service.update('alice', { phone: '555-0100' })).resolves.toMatchObject({
        phone: '555-0100',
      });
    });

    it('throws NotFoundException when missing', async () => {
      repository.updateByUsername.mockResolvedValue(undefined);
      await expect(service.update('ghost', { phone: '555-0100' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('resolves when the account was deleted', async () => {
      repository.deleteByUsername.mockResolvedValue(true);
      await expect(service.delete('alice')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when missing', async () => {
      repository.deleteByUsername.mockResolvedValue(false);
      await expect(service.delete('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * A maximally permissive fluent-builder mock, mirroring pet.repository.spec.ts: every method
 * call returns the same proxy except the terminal "execute" family, which resolves to values
 * that let createMany() proceed past its collision checks. This test only verifies the
 * transaction-wrapping contract (FR-017) — collision semantics are covered above (mocked
 * repository) and by the real rollback e2e case.
 */
function createFluentMock(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'executeTakeFirstOrThrow') {
        return () => Promise.resolve({});
      }
      if (prop === 'executeTakeFirst') {
        return () => Promise.resolve(undefined);
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
  const trx = createFluentMock();
  const executeMock = jest.fn((callback: (trx: unknown) => unknown) =>
    Promise.resolve(callback(trx)),
  );
  const transactionMock = jest.fn(() => ({ execute: executeMock }));
  const db = { transaction: transactionMock } as unknown as Kysely<Database>;
  return { db, transactionMock };
}

describe('UserRepository.createMany transaction boundary (FR-017)', () => {
  it('wraps createMany() in exactly one transaction', async () => {
    const { db, transactionMock } = buildMockedDb();
    const repository = new UserRepository(db);

    await repository.createMany([
      { username: 'alice', password: 'hash1' },
      { username: 'bob', password: 'hash2' },
    ]);

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
