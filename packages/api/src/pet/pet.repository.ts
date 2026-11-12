import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { KYSELY } from '../database/database.module';
import type {
  CategoriesTable,
  Database,
  PetsTable,
  TagsTable,
} from '../database/types';
import type { CreatePetDto } from './dto/create-pet.dto';
import type { UpdatePetDto } from './dto/update-pet.dto';

export type PetRow = Selectable<PetsTable>;
export type CategoryRow = Selectable<CategoriesTable>;
export type TagRow = Selectable<TagsTable>;

export interface PetAggregate {
  pet: PetRow;
  category: CategoryRow | undefined;
  tags: TagRow[];
  photoUrls: string[];
}

@Injectable()
export class PetRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async create(dto: CreatePetDto): Promise<PetAggregate> {
    return this.db.transaction().execute(async (trx) => {
      const category = dto.category ? await this.upsertCategory(trx, dto.category.name) : undefined;

      const pet = await trx
        .insertInto('pets')
        .values({
          name: dto.name,
          category_id: category?.id ?? null,
          status: dto.status ?? 'available',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const tags = dto.tags ? await this.upsertTags(trx, dto.tags.map((t) => t.name)) : [];
      await this.replacePetTags(trx, pet.id, tags);
      await this.replacePhotoUrls(trx, pet.id, dto.photoUrls);

      return { pet, category, tags, photoUrls: dto.photoUrls };
    });
  }

  async update(dto: UpdatePetDto): Promise<PetAggregate | undefined> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('pets')
        .selectAll()
        .where('id', '=', dto.id)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }

      const category = dto.category
        ? await this.upsertCategory(trx, dto.category.name)
        : undefined;

      const pet = await trx
        .updateTable('pets')
        .set({
          name: dto.name,
          status: dto.status ?? existing.status,
          ...(dto.category && { category_id: category?.id ?? null }),
        })
        .where('id', '=', dto.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      let tags: TagRow[] = [];
      if (dto.tags) {
        tags = await this.upsertTags(trx, dto.tags.map((t) => t.name));
        await this.replacePetTags(trx, pet.id, tags);
      } else {
        tags = await this.findTagsForPet(trx, pet.id);
      }

      await this.replacePhotoUrls(trx, pet.id, dto.photoUrls);

      const resolvedCategory =
        category ??
        (pet.category_id
          ? await trx
              .selectFrom('categories')
              .selectAll()
              .where('id', '=', pet.category_id)
              .executeTakeFirst()
          : undefined);

      return { pet, category: resolvedCategory, tags, photoUrls: dto.photoUrls };
    });
  }

  async findById(id: number): Promise<PetAggregate | undefined> {
    const pet = await this.db.selectFrom('pets').selectAll().where('id', '=', id).executeTakeFirst();
    if (!pet) {
      return undefined;
    }
    return this.loadAggregate(this.db, pet);
  }

  async findByStatus(statuses: string[]): Promise<PetAggregate[]> {
    const pets = await this.db
      .selectFrom('pets')
      .selectAll()
      .where('status', 'in', statuses as PetRow['status'][])
      .execute();
    return Promise.all(pets.map((pet) => this.loadAggregate(this.db, pet)));
  }

  async findByTags(tagNames: string[]): Promise<PetAggregate[]> {
    const normalized = tagNames.map((name) => name.trim().toLowerCase());
    const pets = await this.db
      .selectFrom('pets')
      .innerJoin('pet_tags', 'pet_tags.pet_id', 'pets.id')
      .innerJoin('tags', 'tags.id', 'pet_tags.tag_id')
      .where('tags.name', 'in', normalized)
      .select(['pets.id', 'pets.name', 'pets.category_id', 'pets.status', 'pets.created_at', 'pets.updated_at'])
      .distinct()
      .execute();
    return Promise.all(pets.map((pet) => this.loadAggregate(this.db, pet)));
  }

  /** Throws the underlying FK-violation error (code `23503`) if the pet still has an order. */
  async delete(id: number): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const result = await trx.deleteFrom('pets').where('id', '=', id).executeTakeFirst();
      return result.numDeletedRows > 0n;
    });
  }

  async addPhoto(petId: number, url: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const { maxPosition } = await trx
        .selectFrom('pet_photo_urls')
        .select((eb) => eb.fn.max('position').as('maxPosition'))
        .where('pet_id', '=', petId)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('pet_photo_urls')
        .values({ pet_id: petId, url, position: (maxPosition ?? -1) + 1 })
        .execute();
    });
  }

  async findPhotoUrls(petId: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pet_photo_urls')
      .select('url')
      .where('pet_id', '=', petId)
      .orderBy('position', 'asc')
      .execute();
    return rows.map((row) => row.url);
  }

  private async loadAggregate(
    db: Kysely<Database> | Transaction<Database>,
    pet: PetRow,
  ): Promise<PetAggregate> {
    const [category, tags, photoRows] = await Promise.all([
      pet.category_id
        ? db.selectFrom('categories').selectAll().where('id', '=', pet.category_id).executeTakeFirst()
        : Promise.resolve(undefined),
      this.findTagsForPet(db, pet.id),
      db
        .selectFrom('pet_photo_urls')
        .select('url')
        .where('pet_id', '=', pet.id)
        .orderBy('position', 'asc')
        .execute(),
    ]);
    return { pet, category, tags, photoUrls: photoRows.map((row) => row.url) };
  }

  private async findTagsForPet(
    db: Kysely<Database> | Transaction<Database>,
    petId: number,
  ): Promise<TagRow[]> {
    return db
      .selectFrom('pet_tags')
      .innerJoin('tags', 'tags.id', 'pet_tags.tag_id')
      .select(['tags.id', 'tags.name', 'tags.created_at', 'tags.updated_at'])
      .where('pet_tags.pet_id', '=', petId)
      .execute();
  }

  private async upsertCategory(trx: Transaction<Database>, name: string): Promise<CategoryRow> {
    return trx
      .insertInto('categories')
      .values({ name })
      .onConflict((oc) =>
        oc.column('name').doUpdateSet((eb) => ({ name: eb.ref('excluded.name') })),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private async upsertTags(trx: Transaction<Database>, names: string[]): Promise<TagRow[]> {
    const uniqueNames = [...new Set(names)];
    return Promise.all(
      uniqueNames.map((name) =>
        trx
          .insertInto('tags')
          .values({ name })
          .onConflict((oc) =>
            oc.column('name').doUpdateSet((eb) => ({ name: eb.ref('excluded.name') })),
          )
          .returningAll()
          .executeTakeFirstOrThrow(),
      ),
    );
  }

  private async replacePetTags(
    trx: Transaction<Database>,
    petId: number,
    tags: TagRow[],
  ): Promise<void> {
    await trx.deleteFrom('pet_tags').where('pet_id', '=', petId).execute();
    if (tags.length > 0) {
      await trx
        .insertInto('pet_tags')
        .values(tags.map((tag) => ({ pet_id: petId, tag_id: tag.id })))
        .execute();
    }
  }

  private async replacePhotoUrls(
    trx: Transaction<Database>,
    petId: number,
    photoUrls: string[],
  ): Promise<void> {
    await trx.deleteFrom('pet_photo_urls').where('pet_id', '=', petId).execute();
    await trx
      .insertInto('pet_photo_urls')
      .values(photoUrls.map((url, position) => ({ pet_id: petId, url, position })))
      .execute();
  }
}
