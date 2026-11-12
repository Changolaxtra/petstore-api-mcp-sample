# Data Model: Complete the Pet Store API (Pets, Orders, Bulk Accounts)

Every table below already exists — created by `specs/001-db-schema-migration`'s migrations
`0001`–`0006`. This feature adds no new migration; it extends `src/database/types.ts` (per
`research.md` §1) and builds the application layer (repositories/services/controllers) on top
of what's already there.

## Category (`categories` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (Generated) | |
| `name` | `text`, `UNIQUE`, `NOT NULL` | Resolved by name on write (`research.md` §5); client-supplied `id` is ignored on input. |
| `created_at` / `updated_at` | `timestamptz` (Generated) | |

## Tag (`tags` table)

Same shape as Category — `id` (Generated), `name` (`UNIQUE`, `NOT NULL`), `created_at`/`updated_at`.

## Pet (`pets` table + `pet_photo_urls` + `pet_tags`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (Generated) | |
| `name` | `text`, `NOT NULL` | FR-001. |
| `category_id` | `bigint`, nullable, `ON DELETE SET NULL` | Resolved from a submitted category *name* (§5), not a client-supplied id. |
| `status` | `varchar(16)`, `NOT NULL`, `CHECK IN ('available','pending','sold')` | FR-001/FR-003/FR-006. |
| `created_at` / `updated_at` | `timestamptz` (Generated) | |

- **Photos** (`pet_photo_urls`): `id` (Generated), `pet_id` (FK, `ON DELETE CASCADE`), `url`
  (`text`, `NOT NULL`), `position` (`integer`, `UNIQUE` per `pet_id`), `created_at`. Ordered list;
  an uploaded image (FR-008) is appended at the next `position`, never replacing existing rows.
- **Tags** (`pet_tags`, join table): `pet_id` + `tag_id` (composite PK, both `ON DELETE CASCADE`),
  `created_at`. Resolved from submitted tag *names* (§5), not client-supplied ids.

**Validation rules**:

- `name` and at least one photo are required to create a pet (FR-001).
- `status`, when supplied, must be one of `available`/`pending`/`sold` (DB `CHECK` constraint is
  the backstop; the service layer validates first for a clearer error).
- Deleting a pet that still has a row in `store_orders` referencing it is rejected by the existing
  `ON DELETE RESTRICT` foreign key (FR-004/SC-004) — no new application-level check is needed;
  the repository translates that FK violation into the user-facing "still has an order" error.

**Write atomicity** (FR-017): creating or updating a pet is a single transaction covering the
`pets` row itself, the category upsert, every tag upsert, and the photo-URL rows — all or
nothing (`research.md` §4–5).

## Order (`store_orders` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (Generated) | |
| `pet_id` | `bigint`, `NOT NULL`, `ON DELETE RESTRICT` | Must reference an existing pet (FR-010) — enforced by the existing `NOT NULL` + FK constraint; a violation is translated to the "pet not found" response. |
| `quantity` | `integer`, `NOT NULL` | FR-009. |
| `ship_date` | `timestamptz`, nullable | FR-009. |
| `status` | `varchar(16)`, `NOT NULL`, `CHECK IN ('placed','approved','delivered')` | FR-009. |
| `complete` | `boolean`, `NOT NULL`, default `false` | FR-009. |
| `created_at` / `updated_at` | `timestamptz` (Generated) | |

**Validation rules**: `pet_id` must reference an existing pet; `status`, when supplied, must be
one of the three enumerated values.

**Write atomicity** (FR-017): placing an order is a single transaction (one statement today, but
still wrapped per `research.md` §4, so a future addition — e.g. decrementing stock — doesn't
silently fall outside it).

## Bulk account registration (reuses the existing `users` table)

No new entity — `createUsersWithListInput` (FR-015/FR-016) calls a new
`UserRepository.createMany()` that, inside one transaction: normalizes and checks every
submitted username for a collision against existing accounts *and* against the rest of the same
batch (case/whitespace-insensitive, per the existing per-account rule from
`specs/002-user-api-key-auth`), then inserts every row only if the whole batch is clean. Any
collision anywhere in the batch rolls back the entire transaction — zero accounts created
(FR-016/SC-005).

## Entity-relationship summary

```
CATEGORIES ||--o{ PETS           : "zero-or-one category has many pets (ON DELETE SET NULL)"
PETS       ||--o{ PET_PHOTO_URLS : "one pet has many ordered photo URLs (ON DELETE CASCADE)"
PETS       }o--o{ PET_TAGS       : "many-to-many via pet_tags (ON DELETE CASCADE)"
TAGS       }o--o{ PET_TAGS       : "many-to-many via pet_tags (ON DELETE CASCADE)"
PETS       ||--o{ STORE_ORDERS   : "one pet has many orders (ON DELETE RESTRICT)"
```

Unchanged from `packages/api/architecture/erd.md` — this feature introduces no new relationship,
only the application code that reads and writes the ones already diagrammed there.
