# Data Model: Petstore Database Schema Migration

Derived from `packages/api/swagger/openapi_pet_store.json` plus the decisions recorded in `research.md`. This is the schema contract the migration in `packages/api/migrations/` implements; see `contracts/schema.md` for the literal DDL shape.

## Entities

### `categories`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | matches contract `Category.id` (int64) |
| `name` | `TEXT` | `NOT NULL`, `UNIQUE` | FR-012 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | maintained by trigger |

### `tags`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | matches contract `Tag.id` |
| `name` | `TEXT` | `NOT NULL`, `UNIQUE` | FR-012 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | maintained by trigger |

### `pets`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | matches contract `Pet.id` |
| `name` | `TEXT` | `NOT NULL` | contract requires `name` |
| `category_id` | `BIGINT` | FK → `categories.id`, `ON DELETE SET NULL`, nullable | FR-004, optional association |
| `status` | `VARCHAR(16)` | `NOT NULL`, `CHECK (status IN ('available','pending','sold'))` | FR-006 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | maintained by trigger |

### `pet_photo_urls`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | surrogate; contract models this as a plain string list with no `id` |
| `pet_id` | `BIGINT` | FK → `pets.id`, `ON DELETE CASCADE`, `NOT NULL` | FR-003 |
| `url` | `TEXT` | `NOT NULL` | |
| `position` | `INTEGER` | `NOT NULL` | preserves contract array order |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |

Unique constraint on (`pet_id`, `position`) so ordering stays unambiguous per pet.

### `pet_tags`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `pet_id` | `BIGINT` | FK → `pets.id`, `ON DELETE CASCADE`, part of composite PK | FR-002 |
| `tag_id` | `BIGINT` | FK → `tags.id`, `ON DELETE CASCADE`, part of composite PK | FR-002 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |

Composite primary key (`pet_id`, `tag_id`) — a pet can't carry the same tag twice.

### `store_orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | matches contract `Order.id` |
| `pet_id` | `BIGINT` | FK → `pets.id`, `ON DELETE RESTRICT`, `NOT NULL` | FR-005, FR-011 |
| `quantity` | `INTEGER` | `NOT NULL` | |
| `ship_date` | `TIMESTAMPTZ` | nullable | contract does not mark it required |
| `status` | `VARCHAR(16)` | `NOT NULL`, `CHECK (status IN ('placed','approved','delivered'))` | FR-007 |
| `complete` | `BOOLEAN` | `NOT NULL DEFAULT false` | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | maintained by trigger |

### `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | PK, identity | matches contract `User.id` |
| `username` | `TEXT` | `NOT NULL`, `UNIQUE` | FR-008, matches `/user/{username}` lookup |
| `first_name` | `TEXT` | nullable | |
| `last_name` | `TEXT` | nullable | |
| `email` | `TEXT` | nullable | contract doesn't mark required; no format constraint enforced at DB level |
| `password` | `TEXT` | nullable | stored as given by the contract; hashing/handling is an application-layer concern outside this feature's scope |
| `phone` | `TEXT` | nullable | |
| `user_status` | `INTEGER` | nullable | matches contract's plain integer status code |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | maintained by trigger |

## Relationships

| From | To | Cardinality | Delete behavior |
|---|---|---|---|
| `pets.category_id` | `categories.id` | many pets → zero-or-one category | `SET NULL` |
| `pet_tags` | `pets.id` / `tags.id` | many pets ↔ many tags | `CASCADE` (join rows only) |
| `pet_photo_urls.pet_id` | `pets.id` | one pet → many photo URLs | `CASCADE` |
| `store_orders.pet_id` | `pets.id` | one pet → many orders | `RESTRICT` |

`users` has no foreign key relationship to the other entities in this contract (the OpenAPI spec does not link orders or pets to a user).

## Validation rules carried into the schema

- Pet/Order `status` restricted to the contract's enum values at the DB layer (FR-006, FR-007, SC-004).
- `categories.name`, `tags.name`, `users.username` unique (FR-008, FR-012).
- A Pet cannot be deleted while a `store_orders` row references it (FR-011).
- `pet_photo_urls` may be empty for a given pet (zero rows is valid — contract requires the field present, not non-empty).

## State transitions

- `pets.status`: `available → pending → sold` is the expected flow per the Petstore domain, but the schema only constrains *membership* in the enum (FR-006), not transition order — enforcing transition order is an application-layer concern for a later feature.
- `store_orders.status`: `placed → approved → delivered`, same note — only enum membership (FR-007) is enforced here.
