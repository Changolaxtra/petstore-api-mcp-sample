import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRepository, type UserRow } from '../user/user.repository';
import { ApiKeyStoreService } from './api-key-store.service';

export interface AuthenticatedRequest extends Request {
  user: UserRow;
  apiKey: string;
}

/**
 * Enforces the `api_key` header security scheme declared in
 * packages/api/swagger/openapi_pet_store.json for the protected `user`
 * operations (logoutUser, getUserByName, updateUser, deleteUser).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyStore: ApiKeyStoreService,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = request.headers['api_key'];

    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new UnauthorizedException('Missing or invalid api_key header');
    }

    const userId = await this.apiKeyStore.resolve(apiKey);
    if (userId === null) {
      throw new UnauthorizedException('Missing or invalid api_key header');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Missing or invalid api_key header');
    }

    request.user = user;
    request.apiKey = apiKey;
    return true;
  }
}
