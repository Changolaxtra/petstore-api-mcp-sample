import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyStoreService } from '../security/api-key-store.service';
import { PasswordHasherService } from '../security/password-hasher.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UserRepository, type UserRow } from './user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly apiKeyStore: ApiKeyStoreService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserRow> {
    const existing = await this.userRepository.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException(`Username "${dto.username}" is already taken`);
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    return this.userRepository.create({
      username: dto.username,
      password: passwordHash,
      email: dto.email ?? null,
      first_name: dto.firstName ?? null,
      last_name: dto.lastName ?? null,
      phone: dto.phone ?? null,
      user_status: dto.userStatus ?? null,
    });
  }

  /** Issues an API key on success. Fails identically for an unknown username or a wrong password (FR-005). */
  async login(username: string, password: string): Promise<string> {
    const user = await this.userRepository.findByUsername(username);
    const invalidCredentials = () => new BadRequestException('Invalid username/password supplied');

    if (!user || !user.password) {
      throw invalidCredentials();
    }

    const passwordMatches = await this.passwordHasher.verify(user.password, password);
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return this.apiKeyStore.issue(user.id);
  }

  async logout(apiKey: string): Promise<void> {
    await this.apiKeyStore.revoke(apiKey);
  }

  async getByUsername(username: string): Promise<UserRow> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new NotFoundException(`User "${username}" not found`);
    }
    return user;
  }

  async update(username: string, dto: UpdateUserDto): Promise<UserRow> {
    const passwordHash = dto.password ? await this.passwordHasher.hash(dto.password) : undefined;

    const updated = await this.userRepository.updateByUsername(username, {
      ...(passwordHash !== undefined && { password: passwordHash }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.firstName !== undefined && { first_name: dto.firstName }),
      ...(dto.lastName !== undefined && { last_name: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.userStatus !== undefined && { user_status: dto.userStatus }),
    });

    if (!updated) {
      throw new NotFoundException(`User "${username}" not found`);
    }
    return updated;
  }

  async delete(username: string): Promise<void> {
    const deleted = await this.userRepository.deleteByUsername(username);
    if (!deleted) {
      throw new NotFoundException(`User "${username}" not found`);
    }
  }
}
