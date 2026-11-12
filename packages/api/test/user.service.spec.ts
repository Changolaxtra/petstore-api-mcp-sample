import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiKeyStoreService } from '../src/security/api-key-store.service';
import { PasswordHasherService } from '../src/security/password-hasher.service';
import type { CreateUserDto } from '../src/user/dto/create-user.dto';
import { UserRepository, type UserRow } from '../src/user/user.repository';
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
