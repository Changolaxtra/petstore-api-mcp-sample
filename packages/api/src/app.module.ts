import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { PetModule } from './pet/pet.module';
import { SecurityModule } from './security/security.module';
import { ValkeyModule } from './security/valkey.module';
import { StoreModule } from './store/store.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    ValkeyModule,
    SecurityModule,
    HealthModule,
    UserModule,
    PetModule,
    StoreModule,
  ],
})
export class AppModule {}
