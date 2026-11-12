---

description: "Task list for Complete the Pet Store API (Pets, Orders, Bulk Accounts)"

---

# Tasks: Complete the Pet Store API (Pets, Orders, Bulk Accounts)

**Input**: Design documents from `/specs/004-complete-pet-store-api/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included, same rationale as `specs/002-user-api-key-auth/tasks.md` and
`specs/003-swagger-ui-docs/tasks.md` — the project constitution's real-infrastructure testing
conventions, not TDD. Transaction-boundary unit tests (mocked `db.transaction()`) verify every
write is wrapped per FR-017 cheaply and deterministically; one real e2e rollback (bulk-user
batch collision) proves it against the actual database too, without needing contrived
DB-constraint gymnastics for every case.

**Organization**: Setup → Foundational → US1 → US2 → US3 → US4 → Polish, per `spec.md`'s four
user stories (P1–P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

---

## Phase 1: Setup

- [X] T001 [P] Add `packages/api/uploads/` to `.gitignore`; add a named volume for it to the `api` service in `docker-compose.yml`, mirroring the existing `postgres_data` volume (`research.md` §8)
- [X] T002 [P] Extend `packages/api/src/database/types.ts` with `CategoriesTable`, `TagsTable`, `PetsTable`, `PetPhotoUrlsTable`, `PetTagsTable`, and `StoreOrdersTable`, matching migrations `0001`–`0006` column-for-column (`research.md` §1, `data-model.md`)

**Checkpoint**: Typed access to every remaining table is available; nothing yet queries it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared security wiring and contract amendment every pet/store operation needs,
plus retrofitting transactions onto the account operations that already exist.

**⚠️ CRITICAL**: No user story task may start until this phase is complete.

- [X] T003 Create `packages/api/src/security/security.module.ts`: `@Global()` module providing and exporting `PasswordHasherService`, `ApiKeyStoreService`, `ApiKeyGuard`, and `UserRepository` (`research.md` §2)
- [X] T004 Update `packages/api/src/user/user.module.ts`: remove `PasswordHasherService`/`ApiKeyStoreService`/`ApiKeyGuard`/`UserRepository` from its own `providers` array (now supplied globally by `SecurityModule`), keeping only `UserService`/`UserController` (depends on T003)
- [X] T005 Register `SecurityModule` in `packages/api/src/app.module.ts`'s `imports`, alongside `DatabaseModule`/`ValkeyModule` (depends on T003)
- [X] T006 Wrap `UserRepository.create`/`updateByUsername`/`deleteByUsername` in `packages/api/src/user/user.repository.ts` each in `this.db.transaction().execute(async (trx) => ...)`, using `trx` for every statement in that method (`research.md` §4)
- [X] T007 [P] Amend `packages/api/swagger/openapi_pet_store.json` per `contracts/pet-api.md`: add `{"api_key": []}` to the `security` array of `addPet`, `updatePet`, `updatePetWithForm`, `deletePet`, `findPetsByStatus`, `findPetsByTags`, and `uploadFile`; remove `deletePet`'s standalone, unused `api_key` header parameter

**Checkpoint**: `ApiKeyGuard` is usable from any module without a circular import; the contract
reflects the security this feature will actually enforce; existing account writes are
transactional.

---

## Phase 3: User Story 1 - Manage the pet catalog (Priority: P1) 🎯 MVP

**Goal**: Add, retrieve, update, and remove pets, each write atomic, removal blocked while an
order references the pet.

**Independent Test**: Add a pet with photos/category/tags, retrieve it, update a field, remove
it; confirm a pet with an order on file cannot be removed.

### Implementation for User Story 1

- [X] T008 [P] [US1] Create `CreatePetDto` (`name`, `photoUrls` required; `category`/`tags`/`status` optional) in `packages/api/src/pet/dto/create-pet.dto.ts`
- [X] T009 [P] [US1] Create `UpdatePetDto` (same shape plus required `id`, matching the contract's body-identified `updatePet`) in `packages/api/src/pet/dto/update-pet.dto.ts`
- [X] T010 [P] [US1] Create `PetResponseDto` (maps a pet row plus its resolved category name, tags, and photo URLs) in `packages/api/src/pet/dto/pet-response.dto.ts`
- [X] T011 [US1] Implement `PetRepository` in `packages/api/src/pet/pet.repository.ts`: `create`, `update`, `findById`, `delete` — each inside `db.transaction().execute()`; category/tag resolution via the upsert-by-name statement from `research.md` §5; `delete` lets the existing `ON DELETE RESTRICT` FK violation surface for the service layer to translate (depends on T002)
- [X] T012 [US1] Implement `PetService` in `packages/api/src/pet/pet.service.ts`: `create`/`update`/`getById`/`delete`, mapping "not found" to `404` and the FK-restrict violation on delete to `409` (depends on T011)
- [X] T013 [US1] Implement `PetController` in `packages/api/src/pet/pet.controller.ts`: `POST /pet` (`addPet`), `PUT /pet` (`updatePet`), `GET /pet/:petId` (`getPetById`), `DELETE /pet/:petId` (`deletePet`) — all `@UseGuards(ApiKeyGuard)` (depends on T012, T005)
- [X] T014 [US1] Implement `PetModule` in `packages/api/src/pet/pet.module.ts` and register it in `packages/api/src/app.module.ts` (depends on T013)

### Tests for User Story 1

- [X] T015 [P] [US1] Unit tests for `PetService` (mocked `PetRepository`): create/update/getById/delete, including not-found and still-has-an-order cases, in `packages/api/test/pet.service.spec.ts`
- [X] T016 [P] [US1] Unit test for `PetRepository` asserting `create`/`update`/`delete` each call `db.transaction().execute()` exactly once (mocked Kysely), in `packages/api/test/pet.repository.spec.ts`
- [X] T017 [US1] e2e test (new file, `testcontainers` Postgres + Valkey): create → get → update → delete lifecycle, including category/tags round-tripping correctly, in `packages/api/test/pet.e2e-spec.ts`

**Checkpoint**: User Story 1 is independently functional — `quickstart.md` step 1 passes.

---

## Phase 4: User Story 2 - Find a pet to buy (Priority: P2)

**Goal**: Search pets by status or tag; upload an image that appears among a pet's photos.

**Independent Test**: Search by a known status and by a known tag, confirming only matching
pets are returned; upload an image for a pet and confirm it appears in that pet's photos
alongside any it already had.

### Implementation for User Story 2

- [X] T018 [P] [US2] Create `FindPetsQueryDto` (comma-split `status`/`tags` handling, per `research.md` §6) in `packages/api/src/pet/dto/find-pets-query.dto.ts`
- [X] T019 [P] [US2] Create `UploadImageQueryDto` (`additionalMetadata`, optional) in `packages/api/src/pet/dto/upload-image-query.dto.ts`
- [X] T020 [US2] Extend `PetRepository` with `findByStatus(statuses)`, `findByTags(tagNames)`, and `addPhoto(petId, url)` in `packages/api/src/pet/pet.repository.ts` (depends on T011)
- [X] T021 [US2] Extend `PetService` with `findByStatus`/`findByTags`/`uploadImage(petId, buffer, metadata)` — writes the uploaded bytes under `packages/api/uploads/<petId>/`, computes the resulting `/uploads/...` URL, calls `addPhoto` — in `packages/api/src/pet/pet.service.ts` (depends on T012, T020)
- [X] T022 [US2] Extend `PetController` with `GET /pet/findByStatus`, `GET /pet/findByTags`, `POST /pet/:petId/uploadImage` (all `@UseGuards(ApiKeyGuard)`) in `packages/api/src/pet/pet.controller.ts` (depends on T013, T021)
- [X] T023 [US2] Update `packages/api/src/main.ts`: type the app as `NestExpressApplication`, call `app.useStaticAssets(...)` for `/uploads`, and register route-scoped `express.raw({ type: 'application/octet-stream' })` middleware for `POST /pet/:petId/uploadImage` (`research.md` §7–8) (depends on T022)

### Tests for User Story 2

- [X] T024 [P] [US2] Unit tests for `PetService.findByStatus`/`findByTags`/`uploadImage` (mocked repository and filesystem write) in `packages/api/test/pet.service.spec.ts`
- [X] T025 [US2] Extend `packages/api/test/pet.e2e-spec.ts`: search by status, search by tags, upload an image for a pet and confirm it's appended to `photoUrls` (depends on T017, T023)

**Checkpoint**: User Stories 1 and 2 both work independently — `quickstart.md` steps 1–2 pass.

---

## Phase 5: User Story 3 - Place and manage an order (Priority: P3)

**Goal**: Place an order for an existing pet, look it up, delete it, and check an inventory
summary — all independent of the catalog's write path beyond needing a pet to already exist.

**Independent Test**: Place an order for an existing pet, retrieve it by id, delete it, confirm
it's gone; confirm an order for a nonexistent pet is refused; confirm inventory reflects pets'
current statuses.

### Implementation for User Story 3

- [X] T026 [P] [US3] Create `PlaceOrderDto` in `packages/api/src/store/dto/place-order.dto.ts`
- [X] T027 [P] [US3] Create `OrderResponseDto` in `packages/api/src/store/dto/order-response.dto.ts`
- [X] T028 [US3] Implement `OrderRepository` in `packages/api/src/store/store.repository.ts`: `create`, `findById`, `delete`, `getInventory` — `create`/`delete` inside `db.transaction().execute()`; `create` lets the `pet_id` FK violation surface for the service layer to translate into "pet not found" (depends on T002)
- [X] T029 [US3] Implement `StoreService` in `packages/api/src/store/store.service.ts`: `placeOrder`/`getById`/`delete`/`getInventory`, mapping "not found" (order or referenced pet) to `404` (depends on T028)
- [X] T030 [US3] Implement `StoreController` in `packages/api/src/store/store.controller.ts`: `POST /store/order`, `GET /store/order/:orderId`, `DELETE /store/order/:orderId` (open, no guard) and `GET /store/inventory` (`@UseGuards(ApiKeyGuard)`) (depends on T029, T005)
- [X] T031 [US3] Implement `StoreModule` in `packages/api/src/store/store.module.ts` and register it in `packages/api/src/app.module.ts` (depends on T030)

### Tests for User Story 3

- [X] T032 [P] [US3] Unit tests for `StoreService` (mocked repository): place/get/delete/inventory, including pet-not-found and order-not-found cases, in `packages/api/test/store.service.spec.ts`
- [X] T033 [P] [US3] Unit test for `OrderRepository` asserting `create`/`delete` each call `db.transaction().execute()` exactly once (mocked Kysely), in `packages/api/test/store.repository.spec.ts`
- [X] T034 [US3] Extend `packages/api/test/pet.e2e-spec.ts`: place an order for a pet created earlier in the suite → get → delete → confirm `404` after; inventory reflects current pet statuses; an order for a nonexistent pet is refused (depends on T017, T031)

**Checkpoint**: User Stories 1–3 all work independently — `quickstart.md` steps 1–3 pass.

---

## Phase 6: User Story 4 - Register several accounts at once (Priority: P4)

**Goal**: Submit several new accounts in one request; a batch with any collision creates none of
it.

**Independent Test**: Submit several non-conflicting accounts in one request and confirm each
exists afterward; submit a batch where one entry collides and confirm the entire batch —
including the otherwise-valid entries — was not created.

### Implementation for User Story 4

- [X] T035 [P] [US4] Create `CreateUsersListDto` (a validated array of the existing `CreateUserDto` shape, `@ArrayMinSize(1)`) in `packages/api/src/user/dto/create-users-list.dto.ts`
- [X] T036 [US4] Implement `UserRepository.createMany(users)` in `packages/api/src/user/user.repository.ts`: inside one `db.transaction().execute()`, normalize and check every submitted username against existing accounts and against the rest of the same batch (case/whitespace-insensitive, per the existing per-account rule), then insert every row only if the whole batch is clean — any collision throws, rolling back the transaction (depends on T006, T035)
- [X] T037 [US4] Implement `UserService.createMany(dtos)` in `packages/api/src/user/user.service.ts`: hash each password, delegate to `UserRepository.createMany`, map a batch collision to `409` (depends on T036)
- [X] T038 [US4] Add `POST /user/createWithList` (`createUsersWithListInput`, open, no guard) to `packages/api/src/user/user.controller.ts` (depends on T037)

### Tests for User Story 4

- [X] T039 [P] [US4] Unit tests for `UserService.createMany`/`UserRepository.createMany` (mocked repository/Kysely, including the transaction-boundary assertion) in `packages/api/test/user.service.spec.ts`
- [X] T040 [US4] Extend `packages/api/test/user.e2e-spec.ts` with the real rollback proof: a batch containing an internal username collision creates none of that batch's accounts, including the otherwise-valid ones (FR-016/SC-005) (depends on T038)

**Checkpoint**: All four user stories are independently functional — `quickstart.md` steps 1–4
pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T041 [P] Update the root `README.md`: document the pet/store endpoints and bulk account registration briefly, and note that every pet operation now requires `api_key` (per the contract amendment)
- [X] T042 Run `quickstart.md` end-to-end against a freshly built `docker compose up --build` stack (confirms T001's upload volume and T023's static serving), then re-run `npm run test` and `npm run test:e2e --workspace packages/api`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. MVP slice.
- **User Story 2 (Phase 4)**: Depends on Foundational and on User Story 1's `PetRepository`/
  `PetService`/`PetController`/`PetModule` existing (it extends the same files) — not
  independent at the file level, but independently *testable* once both are in place.
- **User Story 3 (Phase 5)**: Depends on Foundational only for its own CRUD; its e2e test
  reuses a pet created by User Story 1's e2e test rather than standing up a second environment,
  but the implementation itself has no dependency on User Stories 1/2's code.
- **User Story 4 (Phase 6)**: Depends on Foundational (specifically T006's transaction
  convention) only — fully independent of pets/orders.
- **Polish (Phase 7)**: Depends on all four user stories.

### Parallel Opportunities

- T001 ∥ T002 (Setup).
- T006 ∥ T007 once T003–T005 land (Foundational); T007 only touches the JSON contract file.
- All `[P]` DTO tasks within a story (e.g. T008 ∥ T009 ∥ T010) can run together.
- User Story 3 and User Story 4's *implementation* tasks can proceed in parallel with User
  Story 2's, once Foundational is done — they touch entirely different files
  (`store/`/`user/` vs. `pet/`). Their e2e tests, however, share `pet.e2e-spec.ts`/
  `user.e2e-spec.ts` with earlier stories' tests and should be added sequentially to avoid
  merge conflicts in those files.

---

## Parallel Example: User Story 1

```bash
Task: "Create CreatePetDto in packages/api/src/pet/dto/create-pet.dto.ts"
Task: "Create UpdatePetDto in packages/api/src/pet/dto/update-pet.dto.ts"
Task: "Create PetResponseDto in packages/api/src/pet/dto/pet-response.dto.ts"
```

## Parallel Example: User Story 3 alongside User Story 2

```bash
# Once Foundational is done, these can proceed on separate files simultaneously:
Task: "Implement OrderRepository in packages/api/src/store/store.repository.ts"      # US3
Task: "Extend PetRepository with findByStatus/findByTags/addPhoto"                    # US2
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (critical — blocks everything).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run `quickstart.md` step 1.

### Incremental Delivery

1. Setup + Foundational → typed tables, global security providers, amended contract, existing
   account writes now transactional.
2. + User Story 1 → pet catalog CRUD (MVP).
3. + User Story 2 → search and image upload on top of the catalog.
4. + User Story 3 → orders and inventory (independent of 1–2's code, not of pets existing).
5. + User Story 4 → bulk account registration (fully independent).
6. + Polish → README updated, full stack re-validated.

---

## Notes

- `[P]` tasks touch different files and have no unmet dependencies.
- `[Story]` labels map every user-story-phase task back to `spec.md`'s US1–US4.
- Transaction coverage (FR-017) is verified two ways: a mocked-Kysely unit test per repository
  asserting the wrapping call count (fast, deterministic, covers every method), and one real
  e2e rollback case (T040) proving it against the actual database for at least one scenario.
- Commit after each task or logical group.
