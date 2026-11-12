import { ConflictException, NotFoundException } from '@nestjs/common';
import { readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { CreatePetDto } from '../src/pet/dto/create-pet.dto';
import type { UpdatePetDto } from '../src/pet/dto/update-pet.dto';
import { PetRepository, type PetAggregate, type PetRow } from '../src/pet/pet.repository';
import { PetService } from '../src/pet/pet.service';

function buildPetRow(overrides: Partial<PetRow> = {}): PetRow {
  return {
    id: 1,
    name: 'Rex',
    category_id: null,
    status: 'available',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildAggregate(overrides: Partial<PetAggregate> = {}): PetAggregate {
  return {
    pet: buildPetRow(),
    category: undefined,
    tags: [],
    photoUrls: ['https://example.com/rex.jpg'],
    ...overrides,
  };
}

describe('PetService', () => {
  let service: PetService;
  let repository: jest.Mocked<PetRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
      findByTags: jest.fn(),
      delete: jest.fn(),
      addPhoto: jest.fn(),
      findPhotoUrls: jest.fn(),
    } as unknown as jest.Mocked<PetRepository>;

    service = new PetService(repository);
  });

  it('creates a pet and maps the aggregate to a response', async () => {
    repository.create.mockResolvedValue(buildAggregate());
    const dto: CreatePetDto = { name: 'Rex', photoUrls: ['https://example.com/rex.jpg'] };

    const result = await service.create(dto);

    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(result.name).toBe('Rex');
    expect(result.photoUrls).toEqual(['https://example.com/rex.jpg']);
  });

  describe('update', () => {
    const dto: UpdatePetDto = { id: 1, name: 'Rex', photoUrls: ['https://example.com/rex.jpg'] };

    it('returns the updated pet when found', async () => {
      repository.update.mockResolvedValue(buildAggregate());
      await expect(service.update(dto)).resolves.toMatchObject({ name: 'Rex' });
    });

    it('throws NotFoundException when missing', async () => {
      repository.update.mockResolvedValue(undefined);
      await expect(service.update(dto)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateFromForm', () => {
    it('merges the partial change with the existing pet and delegates to update()', async () => {
      repository.findById.mockResolvedValue(buildAggregate());
      repository.update.mockResolvedValue(buildAggregate({ pet: buildPetRow({ status: 'sold' }) }));

      const result = await service.updateFromForm(1, { status: 'sold' });

      expect(repository.update).toHaveBeenCalledWith({
        id: 1,
        name: 'Rex',
        photoUrls: ['https://example.com/rex.jpg'],
        status: 'sold',
      });
      expect(result.status).toBe('sold');
    });

    it('throws NotFoundException when the pet does not exist', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(service.updateFromForm(999, { status: 'sold' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getById', () => {
    it('returns the pet when found', async () => {
      repository.findById.mockResolvedValue(buildAggregate());
      await expect(service.getById(1)).resolves.toMatchObject({ id: 1 });
    });

    it('throws NotFoundException when missing', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(service.getById(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('resolves when the pet was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(1)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when missing', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the pet still has an order (FK violation)', async () => {
      repository.delete.mockRejectedValue({ code: '23503' });
      await expect(service.delete(1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrelated error', async () => {
      const error = new Error('connection lost');
      repository.delete.mockRejectedValue(error);
      await expect(service.delete(1)).rejects.toBe(error);
    });
  });

  describe('findByStatus / findByTags', () => {
    it('maps every aggregate found by status', async () => {
      repository.findByStatus.mockResolvedValue([buildAggregate(), buildAggregate({ pet: buildPetRow({ id: 2 }) })]);
      const result = await service.findByStatus(['available']);
      expect(result).toHaveLength(2);
    });

    it('maps every aggregate found by tags', async () => {
      repository.findByTags.mockResolvedValue([buildAggregate()]);
      const result = await service.findByTags(['friendly']);
      expect(result).toHaveLength(1);
    });
  });

  describe('uploadImage', () => {
    const tmpUploadsRoot = path.join(os.tmpdir(), 'pet-service-spec-uploads');

    class TestablePetService extends PetService {
      protected uploadsRoot(): string {
        return tmpUploadsRoot;
      }
    }
    let testableService: TestablePetService;

    afterAll(async () => {
      await rm(tmpUploadsRoot, { recursive: true, force: true });
    });

    beforeEach(() => {
      testableService = new TestablePetService(repository);
    });

    it('writes the bytes to disk and records the resulting URL as a new photo', async () => {
      repository.findById.mockResolvedValue(buildAggregate());

      const url = await testableService.uploadImage(1, Buffer.from('fake-image-bytes'));

      expect(url).toMatch(/^\/uploads\/1\//);
      expect(repository.addPhoto).toHaveBeenCalledWith(1, url);
      const written = await readFile(path.join(tmpUploadsRoot, '1', path.basename(url)));
      expect(written.toString()).toBe('fake-image-bytes');
    });

    it('throws NotFoundException when the pet does not exist', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(
        testableService.uploadImage(999, Buffer.from('fake-image-bytes')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.addPhoto).not.toHaveBeenCalled();
    });
  });
});
