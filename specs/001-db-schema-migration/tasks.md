---

description: "Task list for implementing the Petstore database schema migration"
---

# Tasks: Petstore Database Schema Migration

**Input**: Design documents from `/specs/001-db-schema-migration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema.md, quickstart.md (all present)

**Tests**: Not separately requested in the spec. User Story 1 and User Story 3 are themselves verification-style stories (per their Acceptance Scenarios/Independent Test), so their task phases *are* the test/validation steps — there is no separate "tests before implementation" split for this infrastructure-only feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story, per `spec.md`'s priorities (US1 = P1, US2 = P2, US3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task description

## Path Conventions

Everything lives inside `packages/api/`, plus one shared root file, per `plan.md`'s Structure Decision — no `src/` changes in this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Get a runnable Postgres + Liquibase environment and an empty changelog ready for changesets.

- [X] T001 Create root `docker-compose.yml` with a `postgres` service (health-checked, named volume for data) and a one-shot `liquibase` service (`depends_on: postgres: condition: service_healthy`, mounts `packages/api/migrations/` and runs against `db.changelog-master.yaml`), per the Docker Compose conventions in the root `CLAUDE.md`
- [X] T002 [P] Create root `.env.example` documenting `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (and the derived JDBC/`DATABASE_URL` the `liquibase` and `postgres` services in `docker-compose.yml` need)
- [X] T003 [P] Create `packages/api/migrations/db.changelog-master.yaml` as an empty Liquibase master changelog (no includes yet) ready to have changesets appended to it

**Checkpoint**: `docker compose up -d postgres` succeeds and `docker compose up liquibase` runs an empty changelog successfully.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Write every DDL changeset the schema needs. Every user story below depends on this phase being fully applied, since the Mermaid diagram (US2) must describe the real schema and the integrity checks (US3) are enforced by constraints written here, not added later.

**⚠️ CRITICAL**: No user story task can be verified until this phase's changesets are added to the master changelog and applied.

- [X] T004 [P] Add changeset `packages/api/migrations/0001-create-categories-table.sql` creating `categories` (`id` identity PK, `name` `NOT NULL UNIQUE`, `created_at`/`updated_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml`
- [X] T005 [P] Add changeset `packages/api/migrations/0002-create-tags-table.sql` creating `tags` (`id` identity PK, `name` `NOT NULL UNIQUE`, `created_at`/`updated_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml`
- [X] T006 Add changeset `packages/api/migrations/0003-create-pets-table.sql` creating `pets` (`id` identity PK, `name` `NOT NULL`, `category_id` FK → `categories.id` `ON DELETE SET NULL`, `status VARCHAR(16) CHECK (status IN ('available','pending','sold'))`, `created_at`/`updated_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml` after the categories changeset (depends on T004)
- [X] T007 Add changeset `packages/api/migrations/0004-create-pet-photo-urls-table.sql` creating `pet_photo_urls` (`id` identity PK, `pet_id` FK → `pets.id` `ON DELETE CASCADE`, `url NOT NULL`, `"position" INTEGER NOT NULL`, `UNIQUE (pet_id, "position")`, `created_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml` after the pets changeset (depends on T006)
- [X] T008 Add changeset `packages/api/migrations/0005-create-pet-tags-table.sql` creating `pet_tags` (`pet_id`/`tag_id` FKs `ON DELETE CASCADE`, composite PK on both, `created_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml` after the pets and tags changesets (depends on T005, T006)
- [X] T009 Add changeset `packages/api/migrations/0006-create-store-orders-table.sql` creating `store_orders` (`id` identity PK, `pet_id` FK → `pets.id` `ON DELETE RESTRICT`, `quantity NOT NULL`, `ship_date` nullable, `status VARCHAR(16) CHECK (status IN ('placed','approved','delivered'))`, `complete BOOLEAN NOT NULL DEFAULT false`, `created_at`/`updated_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml` after the pets changeset (depends on T006)
- [X] T010 [P] Add changeset `packages/api/migrations/0007-create-users-table.sql` creating `users` (`id` identity PK, `username NOT NULL UNIQUE`, `first_name`, `last_name`, `email`, `password`, `phone`, `user_status`, `created_at`/`updated_at`), with an explicit `--rollback` dropping the table; append it to `packages/api/migrations/db.changelog-master.yaml`
- [X] T011 [P] Add changeset `packages/api/migrations/0008-create-updated-at-trigger-function.sql` creating the shared `set_updated_at()` PL/pgSQL trigger function, with an explicit `--rollback` dropping the function; append it to `packages/api/migrations/db.changelog-master.yaml`
- [X] T012 Add changeset `packages/api/migrations/0009-attach-updated-at-triggers.sql` attaching `set_updated_at()` as a `BEFORE UPDATE` trigger on `categories`, `tags`, `pets`, `store_orders`, and `users`, with an explicit `--rollback` dropping each trigger; append it to `packages/api/migrations/db.changelog-master.yaml` after all table and function changesets (depends on T004, T005, T006, T009, T010, T011)

**Checkpoint**: `docker compose up liquibase` applies all 9 changesets cleanly against the `postgres` service from Phase 1 — foundation ready for all three user stories.

---

## Phase 3: User Story 1 - Stand up the persistence layer from the published contract (Priority: P1) 🎯 MVP

**Goal**: Prove the schema from Phase 2 gives every Petstore entity a real, working table.

**Independent Test**: Apply the migration to an empty database and confirm every entity from `openapi_pet_store.json` has a matching table; confirm the migration re-applies safely; confirm valid records round-trip.

### Implementation for User Story 1

- [X] T013 [US1] Run `docker compose up -d postgres` then `docker compose up liquibase` against a freshly-created database and confirm the `liquibase` container exits `0` (per `specs/001-db-schema-migration/quickstart.md` step 1)
- [X] T014 [US1] Verify `categories`, `tags`, `pets`, `pet_photo_urls`, `pet_tags`, `store_orders`, and `users` all exist via `psql \dt` / `\d+`, and that `pets`'s columns/types/constraints match `specs/001-db-schema-migration/contracts/schema.md` (per quickstart.md step 2)
- [X] T015 [US1] Re-run `docker compose up liquibase` against the already-migrated database from T013 and confirm it exits `0` with zero new changesets applied and zero errors (per quickstart.md step 3)
- [X] T016 [US1] Insert one valid row into each of `categories`, `pets`, `tags`, `pet_tags`, `pet_photo_urls`, `store_orders`, and `users`, and confirm each is read back unchanged (per quickstart.md step 4, valid-data portion)

**Checkpoint**: User Story 1 is fully verifiable independently — the schema exists, is idempotent, and accepts valid data.

---

## Phase 4: User Story 2 - Understand the data model at a glance (Priority: P2)

**Goal**: Give anyone who didn't write the migration a visual map of the schema.

**Independent Test**: Open the diagram and confirm every table and relationship from the applied schema appears in it, with correct cardinality.

### Implementation for User Story 2

- [X] T017 [US2] Author a Mermaid `erDiagram` in `packages/api/architecture/erd.md` listing all 7 tables (`categories`, `tags`, `pets`, `pet_photo_urls`, `pet_tags`, `store_orders`, `users`) with their key attributes, per `specs/001-db-schema-migration/data-model.md`
- [X] T018 [US2] Add relationship lines with cardinality markers to `packages/api/architecture/erd.md` for Pet–Category (optional, zero-or-one), Pet–Tag (many-to-many via `pet_tags`), Pet–PhotoURL (one-to-many), and Pet–Order (one-to-many), matching the Relationships table in `specs/001-db-schema-migration/data-model.md`
- [X] T019 [US2] Cross-check `packages/api/architecture/erd.md` against the live schema from Phase 2/US1 and confirm no table or relationship is present in one but missing from the other (per quickstart.md step 6)

**Checkpoint**: User Story 2 is fully verifiable independently — the diagram is a complete, accurate mirror of the schema.

---

## Phase 5: User Story 3 - Trust the data even if the API has a bug (Priority: P3)

**Goal**: Prove the database itself — not just future application code — rejects invalid states.

**Independent Test**: Attempt to write data that violates a contract-defined enum or the Pet/Order delete rule, and confirm the database rejects it.

### Implementation for User Story 3

- [X] T020 [US3] Attempt to insert a `pets` row with `status` outside `available`/`pending`/`sold` and confirm PostgreSQL rejects it with a `CHECK` constraint violation (per quickstart.md step 4, invalid-data portion; validates FR-006)
- [X] T021 [US3] Attempt to insert a `store_orders` row with `status` outside `placed`/`approved`/`delivered` and confirm PostgreSQL rejects it with a `CHECK` constraint violation (validates FR-007)
- [X] T022 [US3] Insert a dedicated `pets` row and a `store_orders` row referencing it, then attempt to delete that `pets` row, and confirm PostgreSQL rejects the delete with a foreign key violation (per quickstart.md step 5; validates FR-011)

**Checkpoint**: User Story 3 is fully verifiable independently — invalid data is unrepresentable at the database layer.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the whole feature holds together end-to-end and that every changeset is actually reversible.

- [X] T023 [P] From a clean slate (`docker compose down -v`, then `docker compose up -d postgres` and `docker compose up liquibase`), run every step of `specs/001-db-schema-migration/quickstart.md` in order and confirm all 6 steps pass together, not just in isolation
- [X] T024 Roll back each changeset in `packages/api/migrations/` one at a time against a scratch database (`liquibase rollback-count 1`, repeated) and confirm every `--rollback` block in `packages/api/migrations/*.sql` cleanly reverts its forward changeset, per the rollback requirement in `packages/api/CLAUDE.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (needs `db.changelog-master.yaml` and a running `postgres`/`liquibase` pair to apply against) — BLOCKS all user stories.
- **User Stories (Phase 3-5)**: All depend on Foundational completion. US1, US2, and US3 do not depend on each other and can proceed in any order or in parallel once Phase 2 is applied.
- **Polish (Phase 6)**: Depends on all three user stories being complete (T023 exercises all of them together; T024 exercises every changeset from Phase 2).

### Within Foundational (Phase 2)

- T004 (categories), T005 (tags), T010 (users), and T011 (trigger function) have no cross-dependencies — parallelizable.
- T006 (pets) depends on T004 (references `categories.id`).
- T007 (pet_photo_urls) and T009 (store_orders) depend on T006 (reference `pets.id`).
- T008 (pet_tags) depends on T005 and T006 (references both `tags.id` and `pets.id`).
- T012 (attach triggers) depends on T004, T005, T006, T009, T010, and T011 (every table/function it touches must already be defined).

### Parallel Opportunities

- T002 and T003 (Setup) can run in parallel with each other and with T001.
- T004, T005, T010, and T011 (Foundational) can run in parallel with each other.
- Once Phase 2 is fully applied, US1 (T013-T016), US2 (T017-T019), and US3 (T020-T022) can proceed in parallel — they touch different files/data and don't block each other.

---

## Parallel Example: Foundational Phase

```bash
# Launch the independent table/function changesets together:
Task: "Add changeset packages/api/migrations/0001-create-categories-table.sql"
Task: "Add changeset packages/api/migrations/0002-create-tags-table.sql"
Task: "Add changeset packages/api/migrations/0007-create-users-table.sql"
Task: "Add changeset packages/api/migrations/0008-create-updated-at-trigger-function.sql"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (this is the bulk of the actual schema work for this feature).
3. Complete Phase 3: User Story 1 — apply, inspect, re-apply, insert/read back.
4. **STOP and VALIDATE**: the schema itself is now proven to exist and work; this is a legitimate MVP checkpoint even before the diagram or integrity tests exist.

### Incremental Delivery

1. Setup + Foundational → full schema applied.
2. Add User Story 1 → schema proven functional (MVP).
3. Add User Story 2 → diagram proven to match the schema.
4. Add User Story 3 → integrity constraints proven to hold.
5. Polish → whole feature proven end-to-end and every rollback proven to work.

---

## Notes

- [P] tasks touch different files and have no unmet dependencies.
- [Story] labels map each task back to `spec.md`'s user stories for traceability.
- This feature has no application code, so there are no "models before services before endpoints" layers — Setup/Foundational carry the DDL, and each user story phase is a verification pass proving a specific promise from `spec.md` holds.
- Commit after each changeset (or logical group of changesets) rather than all nine at once, so history stays reviewable.
