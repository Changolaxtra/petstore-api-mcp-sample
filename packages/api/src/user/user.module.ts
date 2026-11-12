import { Module } from '@nestjs/common';
import { ApiKeyStoreService } from '../security/api-key-store.service';
import { ApiKeyGuard } from '../security/api-key.guard';
import { PasswordHasherService } from '../security/password-hasher.service';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  providers: [
    UserRepository,
    UserService,
    PasswordHasherService,
    ApiKeyStoreService,
    ApiKeyGuard,
  ],
})
export class UserModule {}
