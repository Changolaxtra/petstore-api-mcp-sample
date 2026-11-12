import { Optional, SchemaConstraint } from '@leanmcp/core';

export interface CreatePetCategoryInput {
  name: string;
}

export interface CreatePetTagInput {
  name: string;
}

export type CreatePetStatus = 'available' | 'pending' | 'sold';

/**
 * @SchemaConstraint only types minLength/maxLength/minimum/maximum/pattern/
 * enum/description/default/type in its public signature, but the decorator
 * merges whatever object it's given into the generated JSON Schema — so
 * `items`/`properties` below are deliberately passed through a cast rather
 * than left to runtime type inference, which only reads the real .ts source
 * (absent from the compiled Docker image) and otherwise degrades array/
 * object fields to untyped generics.
 */
type JsonSchemaConstraint = Parameters<typeof SchemaConstraint>[0] & Record<string, unknown>;

function schema(constraints: JsonSchemaConstraint): PropertyDecorator {
  return SchemaConstraint(constraints as Parameters<typeof SchemaConstraint>[0]);
}

export class CreatePetInput {
  @schema({
    type: 'string',
    minLength: 1,
    description: 'Name of the pet to create, e.g. "Rex".',
  })
  name!: string;

  @schema({
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    description: 'At least one photo URL for the pet.',
  })
  photoUrls!: string[];

  @Optional()
  @schema({
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Category name, e.g. "Dogs".' },
    },
    required: ['name'],
    description: 'Optional category this pet belongs to.',
  })
  category?: CreatePetCategoryInput;

  @Optional()
  @schema({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tag name, e.g. "friendly".' },
      },
      required: ['name'],
    },
    description: 'Optional tags associated with this pet.',
  })
  tags?: CreatePetTagInput[];

  @Optional()
  @schema({
    type: 'string',
    enum: ['available', 'pending', 'sold'],
    description: 'Status of the pet in the store. Defaults to "available" if omitted.',
  })
  status?: CreatePetStatus;
}
