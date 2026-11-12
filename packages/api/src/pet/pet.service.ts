import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { CreatePetDto } from './dto/create-pet.dto';
import { PetResponseDto } from './dto/pet-response.dto';
import type { UpdatePetDto } from './dto/update-pet.dto';
import { PetRepository, type PetAggregate } from './pet.repository';

/** Postgres foreign-key-violation error code (e.g. an order still references this pet). */
const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

function toResponse(aggregate: PetAggregate): PetResponseDto {
  return PetResponseDto.fromAggregate(
    aggregate.pet,
    aggregate.category,
    aggregate.tags,
    aggregate.photoUrls,
  );
}

@Injectable()
export class PetService {
  constructor(private readonly petRepository: PetRepository) {}

  async create(dto: CreatePetDto): Promise<PetResponseDto> {
    const aggregate = await this.petRepository.create(dto);
    return toResponse(aggregate);
  }

  async update(dto: UpdatePetDto): Promise<PetResponseDto> {
    const aggregate = await this.petRepository.update(dto);
    if (!aggregate) {
      throw new NotFoundException(`Pet ${dto.id} not found`);
    }
    return toResponse(aggregate);
  }

  /** `updatePetWithForm` — a narrower, form-encoded partial update sharing update()'s logic. */
  async updateFromForm(
    petId: number,
    changes: { name?: string; status?: 'available' | 'pending' | 'sold' },
  ): Promise<PetResponseDto> {
    const existing = await this.petRepository.findById(petId);
    if (!existing) {
      throw new NotFoundException(`Pet ${petId} not found`);
    }
    const aggregate = await this.petRepository.update({
      id: petId,
      name: changes.name ?? existing.pet.name,
      photoUrls: existing.photoUrls,
      status: changes.status ?? existing.pet.status,
    });
    return toResponse(aggregate!);
  }

  async getById(id: number): Promise<PetResponseDto> {
    const aggregate = await this.petRepository.findById(id);
    if (!aggregate) {
      throw new NotFoundException(`Pet ${id} not found`);
    }
    return toResponse(aggregate);
  }

  async findByStatus(statuses: string[]): Promise<PetResponseDto[]> {
    const aggregates = await this.petRepository.findByStatus(statuses);
    return aggregates.map(toResponse);
  }

  async findByTags(tagNames: string[]): Promise<PetResponseDto[]> {
    const aggregates = await this.petRepository.findByTags(tagNames);
    return aggregates.map(toResponse);
  }

  async delete(id: number): Promise<void> {
    let deleted: boolean;
    try {
      deleted = await this.petRepository.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(`Pet ${id} still has an order on file and cannot be removed`);
      }
      throw error;
    }
    if (!deleted) {
      throw new NotFoundException(`Pet ${id} not found`);
    }
  }

  /** Writes the uploaded bytes to disk and records the resulting URL as a new photo (research.md §7-8). */
  async uploadImage(petId: number, bytes: Buffer, _additionalMetadata?: string): Promise<string> {
    const existing = await this.petRepository.findById(petId);
    if (!existing) {
      throw new NotFoundException(`Pet ${petId} not found`);
    }

    const directory = join(this.uploadsRoot(), String(petId));
    await mkdir(directory, { recursive: true });
    const filename = randomUUID();
    await writeFile(join(directory, filename), bytes);

    const url = `/uploads/${petId}/${filename}`;
    await this.petRepository.addPhoto(petId, url);
    return url;
  }

  /** packages/api/uploads — src/pet (dev) and dist/pet (built) are both two levels under packages/api/. */
  protected uploadsRoot(): string {
    return join(__dirname, '..', '..', 'uploads');
  }
}
