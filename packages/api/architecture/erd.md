# Petstore Database — Entity-Relationship Diagram

Mirrors the schema created by `packages/api/migrations/` (changesets 0001–0009). See
`specs/001-db-schema-migration/data-model.md` and `contracts/schema.md` for the full column/constraint
detail this diagram summarizes. Whenever the migration changes, update this diagram in the same change.

```mermaid
erDiagram
    CATEGORIES {
        bigint id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }

    TAGS {
        bigint id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }

    PETS {
        bigint id PK
        text name
        bigint category_id FK
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }

    PET_PHOTO_URLS {
        bigint id PK
        bigint pet_id FK
        text url
        integer position
        timestamptz created_at
    }

    PET_TAGS {
        bigint pet_id PK_FK
        bigint tag_id PK_FK
        timestamptz created_at
    }

    STORE_ORDERS {
        bigint id PK
        bigint pet_id FK
        integer quantity
        timestamptz ship_date
        varchar status
        boolean complete
        timestamptz created_at
        timestamptz updated_at
    }

    USERS {
        bigint id PK
        text username
        text first_name
        text last_name
        text email
        text password
        text phone
        integer user_status
        timestamptz created_at
        timestamptz updated_at
    }

    CATEGORIES ||--o{ PETS : "zero-or-one category has many pets (ON DELETE SET NULL)"
    PETS ||--o{ PET_PHOTO_URLS : "one pet has many photo URLs (ON DELETE CASCADE)"
    PETS }o--o{ PET_TAGS : "one pet has many pet_tags rows (ON DELETE CASCADE)"
    TAGS }o--o{ PET_TAGS : "one tag has many pet_tags rows (ON DELETE CASCADE)"
    PETS ||--o{ STORE_ORDERS : "one pet has many orders (ON DELETE RESTRICT)"
```

## Reading this diagram

- **Pet → Category**: optional (a pet may have no category); deleting a Category detaches its
  Pets rather than deleting them.
- **Pet → Tag**: many-to-many through `PET_TAGS`; deleting a Pet or Tag removes only the
  association row, never the other side.
- **Pet → Photo URL**: one pet, many ordered photo URLs; deleting a Pet deletes its photo URLs.
- **Pet → Order**: one pet, many orders; a Pet **cannot** be deleted while it still has an Order —
  the delete is rejected, not cascaded, so order history is never silently lost.
- **Users** has no foreign-key relationship to any other table in this schema — the OpenAPI
  contract does not link Orders or Pets to a User.
