import type { Generated } from 'kysely';

/**
 * Hand-authored for now, scoped to what's needed so far. Treat this as a
 * stand-in for the real `kysely-codegen` output — run
 * `npm run db:codegen --workspace packages/api` after Liquibase applies the
 * full schema to regenerate it with every table, then replace this file.
 */
export interface UsersTable {
  id: Generated<number>;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  password: string | null;
  phone: string | null;
  user_status: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CategoriesTable {
  id: Generated<number>;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TagsTable {
  id: Generated<number>;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PetsTable {
  id: Generated<number>;
  name: string;
  category_id: number | null;
  status: 'available' | 'pending' | 'sold';
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PetPhotoUrlsTable {
  id: Generated<number>;
  pet_id: number;
  url: string;
  position: number;
  created_at: Generated<Date>;
}

export interface PetTagsTable {
  pet_id: number;
  tag_id: number;
  created_at: Generated<Date>;
}

export interface StoreOrdersTable {
  id: Generated<number>;
  pet_id: number;
  quantity: number;
  ship_date: Date | null;
  status: 'placed' | 'approved' | 'delivered';
  complete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  categories: CategoriesTable;
  tags: TagsTable;
  pets: PetsTable;
  pet_photo_urls: PetPhotoUrlsTable;
  pet_tags: PetTagsTable;
  store_orders: StoreOrdersTable;
}
