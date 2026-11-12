import MockAdapter from 'axios-mock-adapter';

jest.mock('../mcp/http/auth', () => ({
  getApiKey: jest.fn().mockResolvedValue('test-api-key'),
  invalidateApiKey: jest.fn(),
}));

import { apiClient } from '../mcp/http/api-client';
import { PetService } from '../mcp/pet';
import { CreatePetInput } from '../mcp/pet/dto/create-pet.input';
import type { StructuredToolErrorBody } from '../mcp/http/tool-error';

function input(overrides: Partial<CreatePetInput>): CreatePetInput {
  return Object.assign(new CreatePetInput(), overrides);
}

async function captureStructuredError(promise: Promise<unknown>): Promise<StructuredToolErrorBody> {
  try {
    await promise;
  } catch (error) {
    return JSON.parse((error as Error).message) as StructuredToolErrorBody;
  }
  throw new Error('Expected create_pet to reject, but it resolved.');
}

describe('PetService.create_pet', () => {
  const mock = new MockAdapter(apiClient);
  const service = new PetService();

  afterEach(() => {
    mock.reset();
  });

  it('creates a pet and returns the API response on success', async () => {
    const created = {
      id: 1,
      name: 'Rex',
      photoUrls: ['https://example.com/rex.jpg'],
      status: 'available',
    };
    mock.onPost('/pet').reply(200, created);

    const result = await service.create_pet(
      input({ name: 'Rex', photoUrls: ['https://example.com/rex.jpg'] }),
    );

    expect(result).toEqual(created);
    expect(mock.history.post[0].headers?.api_key).toBe('test-api-key');
  });

  it('rejects a missing name before calling the API, with a structured validation error', async () => {
    const body = await captureStructuredError(
      service.create_pet(input({ name: '', photoUrls: ['https://example.com/x.jpg'] })),
    );

    expect(body).toEqual({
      isError: true,
      content: {
        errorCategory: 'validation',
        isRetryable: false,
        message: expect.stringContaining('name is required'),
        attempted_query: expect.stringContaining('create_pet'),
        partial_results: null,
      },
    });
    expect(mock.history.post).toHaveLength(0);
  });

  it('rejects empty photoUrls before calling the API, with a structured validation error', async () => {
    const body = await captureStructuredError(
      service.create_pet(input({ name: 'Rex', photoUrls: [] })),
    );

    expect(body.content.errorCategory).toBe('validation');
    expect(body.content.isRetryable).toBe(false);
    expect(body.content.message).toMatch(/photoUrls entry is required/);
    expect(mock.history.post).toHaveLength(0);
  });

  it('maps a 4xx API response to a non-retryable structured error', async () => {
    mock.onPost('/pet').reply(400, { statusCode: 400, message: 'name should not be empty' });

    const body = await captureStructuredError(
      service.create_pet(input({ name: 'Rex', photoUrls: ['https://example.com/x.jpg'] })),
    );

    expect(body.content.errorCategory).toBe('validation');
    expect(body.content.isRetryable).toBe(false);
    expect(body.content.message).toMatch(/rejected the request \(status 400\)/);
  });

  it('maps a 5xx API response to a retryable, transient structured error', async () => {
    mock.onPost('/pet').reply(500, { statusCode: 500, message: 'Unexpected error' });

    const body = await captureStructuredError(
      service.create_pet(input({ name: 'Rex', photoUrls: ['https://example.com/x.jpg'] })),
    );

    expect(body.content.errorCategory).toBe('transient');
    expect(body.content.isRetryable).toBe(true);
    expect(body.content.message).toMatch(/failed to process the request \(status 500\)/);
    expect(body.content.partial_results).toBeNull();
  });

  it('maps a network/unreachable failure to a retryable, transient structured error', async () => {
    mock.onPost('/pet').networkError();

    const body = await captureStructuredError(
      service.create_pet(input({ name: 'Rex', photoUrls: ['https://example.com/x.jpg'] })),
    );

    expect(body.content.errorCategory).toBe('transient');
    expect(body.content.isRetryable).toBe(true);
    expect(body.content.message).toMatch(/Could not reach the Pet Store API/);
  });
});
