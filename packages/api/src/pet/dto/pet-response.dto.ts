import type { Selectable } from 'kysely';
import type { CategoriesTable, PetsTable, TagsTable } from '../../database/types';

type PetRow = Selectable<PetsTable>;
type CategoryRow = Selectable<CategoriesTable>;
type TagRow = Selectable<TagsTable>;

export class PetResponseDto {
  id!: number;
  name!: string;
  category?: { id: number; name: string };
  photoUrls!: string[];
  tags?: { id: number; name: string }[];
  status!: 'available' | 'pending' | 'sold';

  static fromAggregate(
    pet: PetRow,
    category: CategoryRow | undefined,
    tags: TagRow[],
    photoUrls: string[],
  ): PetResponseDto {
    const dto = new PetResponseDto();
    dto.id = pet.id;
    dto.name = pet.name;
    dto.status = pet.status;
    dto.photoUrls = photoUrls;
    if (category) {
      dto.category = { id: category.id, name: category.name };
    }
    if (tags.length > 0) {
      dto.tags = tags.map((tag) => ({ id: tag.id, name: tag.name }));
    }
    return dto;
  }
}
