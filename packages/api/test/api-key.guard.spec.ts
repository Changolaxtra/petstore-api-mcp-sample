import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard, type AuthenticatedRequest } from '../src/security/api-key.guard';
import { ApiKeyStoreService } from '../src/security/api-key-store.service';
import { UserRepository, type UserRow } from '../src/user/user.repository';

function buildUserRow(): UserRow {
  return {
    id: 7,
    username: 'alice',
    first_name: null,
    last_name: null,
    email: null,
    password: 'hashed',
    phone: null,
    user_status: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function buildContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const request: Partial<AuthenticatedRequest> = { headers };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ApiKeyGuard', () => {
  let apiKeyStore: jest.Mocked<ApiKeyStoreService>;
  let userRepository: jest.Mocked<UserRepository>;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    apiKeyStore = { resolve: jest.fn() } as unknown as jest.Mocked<ApiKeyStoreService>;
    userRepository = { findById: jest.fn() } as unknown as jest.Mocked<UserRepository>;
    guard = new ApiKeyGuard(apiKeyStore, userRepository);
  });

  it('rejects a request with no api_key header', async () => {
    const { context } = buildContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a key the store does not recognize (unknown/expired/revoked)', async () => {
    apiKeyStore.resolve.mockResolvedValue(null);
    const { context } = buildContext({ api_key: 'bad-token' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a key resolving to a since-deleted user', async () => {
    apiKeyStore.resolve.mockResolvedValue(7);
    userRepository.findById.mockResolvedValue(undefined);
    const { context } = buildContext({ api_key: 'stale-token' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the resolved user and the api key, and allows the request through', async () => {
    const user = buildUserRow();
    apiKeyStore.resolve.mockResolvedValue(user.id);
    userRepository.findById.mockResolvedValue(user);
    const { context, request } = buildContext({ api_key: 'good-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(user);
    expect(request.apiKey).toBe('good-token');
  });
});
