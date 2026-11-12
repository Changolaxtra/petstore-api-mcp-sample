import { readFileSync } from 'fs';
import { join } from 'path';
import { buildOpenApiDocument } from '../src/docs/build-openapi-document';

describe('buildOpenApiDocument', () => {
  it('matches the committed contract exactly, except for servers', () => {
    const contractPath = join(__dirname, '../swagger/openapi_pet_store.json');
    const committed = JSON.parse(readFileSync(contractPath, 'utf-8'));

    const served = buildOpenApiDocument();

    expect(served).toEqual({ ...committed, servers: [{ url: '/' }] });
    expect(committed.servers).not.toEqual(served.servers);
  });
});
