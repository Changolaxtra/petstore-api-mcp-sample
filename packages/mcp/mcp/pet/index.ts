import { Tool } from '@leanmcp/core';
import { apiClient } from '../http/api-client';
import { throwApiCallError } from '../http/error-mapper';
import { throwStructuredError } from '../http/tool-error';
import { CreatePetInput } from './dto/create-pet.input';
import type { components } from '../http/types.generated';

type Pet = components['schemas']['Pet'];

function describeAttempt(input: CreatePetInput): string {
  return `create_pet(name=${JSON.stringify(input.name ?? null)})`;
}

function validateCreatePetInput(input: CreatePetInput, attemptedQuery: string): void {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throwStructuredError({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'name is required and must be non-empty.',
      attempted_query: attemptedQuery,
      partial_results: null,
    });
  }
  if (!Array.isArray(input.photoUrls)) {
    throwStructuredError({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'photoUrls is required and must be an array of URLs.',
      attempted_query: attemptedQuery,
      partial_results: null,
    });
  }
  const hasPhotoUrl = input.photoUrls.some(
    (url) => typeof url === 'string' && url.trim().length > 0,
  );
  if (!hasPhotoUrl) {
    throwStructuredError({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'at least one non-empty photoUrls entry is required.',
      attempted_query: attemptedQuery,
      partial_results: null,
    });
  }
}

export class PetService {
  @Tool({
    description:
      'Creates a new pet record in the Pet Store. Requires a name and at least one photo URL; category, tags, and status are optional.',
    inputClass: CreatePetInput,
  })
  async create_pet(input: CreatePetInput): Promise<Pet> {
    const attemptedQuery = describeAttempt(input);

    // LeanMCP's stateless HTTP mode does not reliably gate calls on the
    // advertised JSON Schema before invoking this method, so input shape is
    // re-validated defensively here rather than assumed.
    validateCreatePetInput(input, attemptedQuery);

    try {
      const response = await apiClient.post<Pet>('/pet', {
        name: input.name.trim(),
        photoUrls: input.photoUrls,
        category: input.category,
        tags: input.tags,
        status: input.status,
      });
      return response.data;
    } catch (error) {
      throwApiCallError(error, attemptedQuery);
    }
  }
}
