import type { Generated } from 'kysely';

/**
 * Hand-authored for now, scoped to what this feature needs (`users`).
 * Treat this as a stand-in for the real `kysely-codegen` output — run
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

export interface Database {
  users: UsersTable;
}
