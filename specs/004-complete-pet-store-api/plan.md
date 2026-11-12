# Implementation Plan: Complete the Pet Store API (Pets, Orders, Bulk Accounts)

**Branch**: `004-complete-pet-store-api` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-complete-pet-store-api/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implements the thirteen remaining Swagger-defined operations this project hasn't built yet: the
full `pet` tag (catalog CRUD, search by status/tags, image upload), the full `store` tag (place/
get/delete an order, inventory summary), and bulk account registration
(`createUsersWithListInput`). All underlying tables already exist from
`specs/001-db-schema-migration` — this is purely an application-layer addition (repositories,
services, controllers, DTOs) following the same module-per-tag pattern
`specs/002-user-api-key-auth` established for `user`. Every repository write method, new and
pre-existing, is wrapped in an explicit Kysely transaction per the user's own request. Planning
also surfaced and corrects an incorrect assumption from `spec.md`: the committed contract already
requires authentication on every `pet`-tag operation (via an OAuth2 scheme this project can't
meaningfully implement); this plan extends the contract's own already-established
alternative-security pattern to make all of them satisfiable with this project's real `api_key`
mechanism instead. See `research.md` for the full reasoning behind every decision below.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`; Node.js 22.x — unchanged.

**Primary Dependencies**: No new dependency. Everything needed (Kysely transactions,
`@nestjs/platform-express`'s `useStaticAssets`/raw-body middleware, `class-validator`) is already
installed.

**Storage**: PostgreSQL, via the five tables (`categories`, `tags`, `pets`, `pet_photo_urls`,
`pet_tags`, `store_orders`) created by `specs/001-db-schema-migration` and so far untouched by
application code; plus a local `packages/api/uploads/` directory for uploaded images
(`research.md` §8).

**Testing**: Unit tests per repository (mocked Kysely) for `PetRepository`, `OrderRepository`, and
the new `UserRepository.createMany`, including a case that asserts each write runs inside exactly
one `db.transaction().execute()` call. e2e tests (real `testcontainers` Postgres + Valkey,
extending the existing suite's pattern) cover the full pet/order lifecycle plus one *real*
atomicity proof that doesn't need mocking: a bulk-registration batch with an internal username
collision, asserting the otherwise-valid entries in that same batch were never actually created
(FR-016/SC-005) — a genuine rollback the real `UNIQUE` constraint triggers, not a simulated one.

**Target Platform**: Same Docker Compose / Node 22 stack as the rest of `packages/api`.

**Project Type**: Backend web-service modules (`PetModule`, `StoreModule`) within `packages/api`,
plus a new `SecurityModule` extracted from `UserModule` to make `ApiKeyGuard` reusable without a
circular module dependency (`research.md` §2).

**Performance Goals**: None beyond existing expectations; no new indexes needed — `pets.status`,
`categories.name`, and `tags.name` already have the constraints/indexes this feature's queries
rely on (`UNIQUE` on the latter two backs the upsert-by-name pattern directly).

**Constraints**: Every repository write method (new and pre-existing) MUST run inside an explicit
transaction (FR-017; `research.md` §4). Every `pet`-tag operation MUST require the project's
`api_key` header per the contract amendment (`research.md` §3); `store`-tag operations and bulk
account registration MUST stay exactly as open/closed as already committed — no new restriction
invented for them. A pet with an order on file MUST remain undeletable (already enforced by the
existing `ON DELETE RESTRICT` constraint; this plan only has to surface that as a clear response).

**Scale/Scope**: 13 new HTTP operations across two new modules, one DI refactor
(`SecurityModule`), one `Database` interface extension (6 tables), one deliberate contract
amendment (7 `pet` operations gain an `api_key` alternative; `deletePet` loses a redundant
parameter), and a small file-upload/static-serving addition. No existing `user`-tag endpoint's
behavior changes, only its repository's internals (transaction wrapping) and which module
declares its shared security providers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against Constitution v1.0.0:

- **I. Contract-First Development** — PASS. Every new endpoint, DTO field, and status code in
  `contracts/pet-api.md`/`contracts/store-api.md`/`contracts/bulk-user-registration.md` is
  derived from the committed contract. The one change to the contract itself — adding `api_key`
  as an additional security alternative on seven `pet` operations, and removing `deletePet`'s
  redundant unused parameter — is exactly the kind of deliberate, in-feature contract change the
  principle calls for, made only after inspecting what the contract already declared
  (`research.md` §3), not invented ad hoc.
- **II. Liquibase Owns the Schema** — PASS. No schema change at all; every table this feature
  reads and writes already exists from `specs/001-db-schema-migration`.
- **III. Package Boundaries Are HTTP, Not Imports** — PASS (N/A). `packages/mcp` is untouched;
  everything here is within `packages/api`.
- **IV. Typed, Explicit Data Access** — PASS. All new SQL (pet/order CRUD, category/tag upserts,
  bulk user inserts) lives behind `PetRepository`/`OrderRepository`/the extended
  `UserRepository`, typed against the extended `Database` interface — no raw SQL in a
  controller, service, or guard. The `SecurityModule` refactor (`research.md` §2) relocates
  which module *declares* `UserRepository` as a provider; it does not change where its SQL lives
  or let any other module bypass it.
- **V. Spec-Driven Delivery** — PASS. `spec.md` (004) precedes this plan; this plan precedes
  `/speckit-tasks`/`/speckit-implement`.

No violations; Complexity Tracking table remains empty.

*Post-Phase 1 re-check*: `research.md`, `data-model.md`, and `contracts/` introduced nothing that
changes any of the above — still PASS on all five principles. The `SecurityModule` extraction is
worth restating explicitly here as a deliberate architectural choice, not a violation: it exists
specifically *to preserve* Principle IV (no raw Kysely access in a guard) and avoid a circular
module dependency, not to work around either.

## Project Structure

### Documentation (this feature)

```text
specs/004-complete-pet-store-api/
├── plan.md                              # This file (/speckit-plan command output)
├── research.md                          # Phase 0 output (/speckit-plan command)
├── data-model.md                        # Phase 1 output (/speckit-plan command)
├── quickstart.md                        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── pet-api.md                       # Phase 1 output — pet tag + the security amendment
│   ├── store-api.md                     # Phase 1 output — store tag (no amendment)
│   └── bulk-user-registration.md        # Phase 1 output — createUsersWithListInput (no amendment)
└── tasks.md                             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/api/
├── src/
│   ├── app.module.ts                     # amended: + SecurityModule, PetModule, StoreModule
│   ├── main.ts                           # amended: raw-body middleware for image upload, useStaticAssets for /uploads
│   ├── database/
│   │   └── types.ts                      # amended: + Categories/Tags/Pets/PetPhotoUrls/PetTags/StoreOrders tables
│   ├── security/
│   │   └── security.module.ts            # new: @Global(), extracts PasswordHasherService/ApiKeyStoreService/
│   │                                        ApiKeyGuard/UserRepository out of UserModule
│   ├── user/
│   │   ├── user.module.ts                # amended: trimmed to UserService/UserController only
│   │   ├── user.repository.ts            # amended: createMany(); existing methods wrapped in transactions
│   │   ├── user.controller.ts            # amended: + createUsersWithListInput endpoint
│   │   ├── user.service.ts               # amended: + createMany()
│   │   └── dto/
│   │       └── create-users-list.dto.ts  # new
│   ├── pet/
│   │   ├── pet.module.ts
│   │   ├── pet.controller.ts             # addPet, updatePet, updatePetWithForm, deletePet,
│   │   │                                    findPetsByStatus, findPetsByTags, getPetById, uploadFile
│   │   ├── pet.service.ts
│   │   ├── pet.repository.ts             # category/tag upsert-by-name, transactional writes
│   │   └── dto/
│   │       ├── create-pet.dto.ts
│   │       ├── update-pet.dto.ts
│   │       ├── update-pet-form-query.dto.ts
│   │       ├── find-pets-query.dto.ts    # shared comma-split handling for status/tags
│   │       └── pet-response.dto.ts
│   └── store/
│       ├── store.module.ts
│       ├── store.controller.ts           # placeOrder, getOrderById, deleteOrder, getInventory
│       ├── store.service.ts
│       ├── store.repository.ts
│       └── dto/
│           ├── place-order.dto.ts
│           └── order-response.dto.ts
├── uploads/                               # new, gitignored — created at startup if missing
├── Dockerfile                             # unaffected (no new dependency)
├── swagger/
│   └── openapi_pet_store.json             # amended per contracts/pet-api.md §"Contract amendment"
└── test/
    ├── pet.service.spec.ts                # new
    ├── store.service.spec.ts              # new
    ├── user.service.spec.ts               # amended: + createMany cases
    └── pet.e2e-spec.ts                     # new: full pet/order lifecycle + bulk-registration rollback proof

docker-compose.yml                         # amended: named volume for packages/api/uploads
.gitignore                                 # amended: packages/api/uploads/
```

**Structure Decision**: `PetModule`/`StoreModule` mirror `UserModule`'s existing
controller/service/repository/dto layout exactly. `SecurityModule` is the one new cross-cutting
piece, living in the already-established `src/security/` folder alongside `ApiKeyGuard` and
friends. No change to `packages/mcp` or the root monorepo scaffolding.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
