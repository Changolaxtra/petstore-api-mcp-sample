import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type Valkey from 'iovalkey';
import type { EnvConfig } from '../config/env.validation';
import { VALKEY_CLIENT } from './valkey.module';

interface SessionPayload {
  userId: number;
}

/**
 * Valkey-backed API key sessions. See
 * specs/002-user-api-key-auth/contracts/api-key-session.md for the key/value
 * shape and the operations' exact semantics.
 */
@Injectable()
export class ApiKeyStoreService {
  constructor(
    @Inject(VALKEY_CLIENT) private readonly valkey: Valkey,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async issue(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlSeconds = this.config.get('API_KEY_TTL_SECONDS', { infer: true });
    const payload: SessionPayload = { userId };
    await this.valkey.set(this.keyFor(token), JSON.stringify(payload), 'EX', ttlSeconds);
    return token;
  }

  async resolve(token: string): Promise<number | null> {
    const raw = await this.valkey.get(this.keyFor(token));
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw) as SessionPayload;
    return payload.userId;
  }

  async revoke(token: string): Promise<void> {
    await this.valkey.del(this.keyFor(token));
  }

  private keyFor(token: string): string {
    return `apikey:${token}`;
  }
}
