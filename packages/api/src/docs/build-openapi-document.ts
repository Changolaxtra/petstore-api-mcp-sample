import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Serves the committed contract itself (never a decorator-reflected copy),
 * so the documentation page cannot drift from it. The committed `servers`
 * entry ("/api/v3") reflects the public reference Swagger Petstore's own
 * deployment path, not this project's routes (mounted at root, e.g.
 * "/user/login") — overriding it is what makes "Try it out" resolve against
 * the real running server. See specs/003-swagger-ui-docs/research.md §1-2.
 */
export function buildOpenApiDocument(): OpenAPIObject {
  // __dirname is src/docs (dev) or dist/docs (built) — both two levels under
  // packages/api/, which is also where swagger/ lives.
  const contractPath = join(__dirname, '..', '..', 'swagger', 'openapi_pet_store.json');
  const contract = JSON.parse(readFileSync(contractPath, 'utf-8')) as OpenAPIObject;

  return {
    ...contract,
    servers: [{ url: '/' }],
  };
}
