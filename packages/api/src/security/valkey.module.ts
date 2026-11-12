import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Valkey from 'iovalkey';
import type { EnvConfig } from '../config/env.validation';

export const VALKEY_CLIENT = Symbol('VALKEY_CLIENT');

/** Disconnects the client on shutdown — see DatabaseLifecycle for why. */
@Injectable()
class ValkeyLifecycle implements OnModuleDestroy {
  constructor(@Inject(VALKEY_CLIENT) private readonly client: Valkey) {}

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: VALKEY_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>): Valkey => {
        return new Valkey(config.get('VALKEY_URL', { infer: true }));
      },
    },
    ValkeyLifecycle,
  ],
  exports: [VALKEY_CLIENT],
})
export class ValkeyModule {}
