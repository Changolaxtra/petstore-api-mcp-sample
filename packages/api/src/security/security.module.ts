import { Global, Module } from '@nestjs/common';
import { UserRepository } from '../user/user.repository';
import { ApiKeyStoreService } from './api-key-store.service';
import { ApiKeyGuard } from './api-key.guard';
import { PasswordHasherService } from './password-hasher.service';

/**
 * Global so PetModule/StoreModule can use ApiKeyGuard without importing
 * UserModule (which itself needs ApiKeyStoreService) and setting up a
 * circular module dependency. See specs/004-complete-pet-store-api/research.md §2.
 */
@Global()
@Module({
  providers: [UserRepository, PasswordHasherService, ApiKeyStoreService, ApiKeyGuard],
  exports: [UserRepository, PasswordHasherService, ApiKeyStoreService, ApiKeyGuard],
})
export class SecurityModule {}
