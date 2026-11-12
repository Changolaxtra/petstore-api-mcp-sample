---

description: "Task list for User Account Operations & API Key Authentication"

---

# Tasks: User Account Operations & API Key Authentication

**Input**: Design documents from `/specs/002-user-api-key-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. Not because the spec requested TDD, but because the project constitution
binds integration tests touching the database to real Postgres via `testcontainers`
("Development Workflow & Quality Gates") and `packages/api/CLAUDE.md` prescribes the same for
Valkey — this is the first feature with any service code, so it's also the first to stand up that
pattern. Tests appear after the implementation they cover, not before — nothing here requires
strict TDD ordering.

**Organization**: Tasks are grouped by user story (from `spec.md`) to enable independent
implementation and testing of each story, following Setup → Foundational → US1 → US2 → US3 →
Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are relative to the repository root unless noted otherwise

## Path Conventions

Single `packages/api` NestJS project, per `plan.md`'s Project Structure. Root-level files are the
one-time monorepo scaffold every later package-level feature will also depend on.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: First-ever application scaffolding for this repo — nothing below depends on a
specific user story.

- [X] T001 Create root monorepo scaffold: `package.json` (`"workspaces": ["packages/*"]`, shared devDependencies), `tsconfig.base.json` (`strict: true`), `.nvmrc` pinned to Node 22 LTS, matching `engines` in `package.json`
- [X] T002 [P] Scaffold the NestJS app in `packages/api/`: `package.json`, `tsconfig.json` (extends `../../tsconfig.base.json`), `nest-cli.json`, `src/main.ts`, `src/app.module.ts` (empty `imports: []` for now)
- [X] T003 [P] Add `packages/api/Dockerfile` (multi-stage Node build, matches the image `docker-compose.yml`'s future `api` service builds from)
- [X] T004 [P] Add `packages/api/.env.example` and extend root `.env.example` with `VALKEY_URL`, `API_KEY_TTL_SECONDS` (default `1800`), and `PORT`, alongside the existing `DATABASE_URL`/Postgres vars
- [X] T005 Add root ESLint (`.eslintrc.cjs`) and Prettier (`.prettierrc`) configs, and wire `lint`/`format`/`build`/`start:dev`/`test`/`test:e2e` scripts in both the root and `packages/api` `package.json`

**Checkpoint**: `npm install && npm run build --workspace packages/api` succeeds on an empty Nest app.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story needs — database access, password hashing, the
Valkey-backed session store, the auth guard, and the seed data/contract changes the stories are
tested against.

**⚠️ CRITICAL**: No user story task may start until this phase is complete.

- [X] T006 Implement env validation in `packages/api/src/config/env.validation.ts` (`zod` schema for `DATABASE_URL`, `VALKEY_URL`, `API_KEY_TTL_SECONDS`, `PORT`) and wire it via `ConfigModule.forRoot({ validate })` in `packages/api/src/app.module.ts`
- [X] T007 [P] Implement the Kysely database provider in `packages/api/src/database/database.module.ts` (pg `Pool` from `DATABASE_URL`)
- [X] T008 [P] Author the `Database` interface (`kysely-codegen` shape) covering the existing `users` table in `packages/api/src/database/types.ts`, per `data-model.md`
- [X] T009 [P] Implement `PasswordHasherService` (Argon2id `hash`/`verify`) in `packages/api/src/security/password-hasher.service.ts`, per `research.md` §2
- [X] T010 [P] Implement the Valkey client provider (`iovalkey`, pointed at `VALKEY_URL`) in `packages/api/src/security/valkey.module.ts`, per `research.md` §4
- [X] T011 Implement `ApiKeyStoreService` (`issue`/`resolve`/`revoke` against `apikey:<token>` keys with `API_KEY_TTL_SECONDS` TTL) in `packages/api/src/security/api-key-store.service.ts`, per `contracts/api-key-session.md` (depends on T010)
- [X] T012 Implement `UserRepository` (`findByUsername` with case/whitespace-insensitive lookup, `create`, `update`, `delete`) against the Kysely `Database` interface in `packages/api/src/user/user.repository.ts` (depends on T008)
- [X] T013 Implement `ApiKeyGuard` (`CanActivate`: reads the `api_key` header, resolves it via `ApiKeyStoreService`, loads the user via `UserRepository` to confirm the account still exists, attaches `request.user`, else `401`) in `packages/api/src/security/api-key.guard.ts`, per `research.md` §6 (depends on T011, T012)
- [X] T014 [P] Implement the shared HTTP exception filter (maps errors to the OpenAPI error shape already defined for the `user` tag) in `packages/api/src/common/filters/http-exception.filter.ts`
- [X] T015 Add a health endpoint (`@nestjs/terminus`, checks Postgres connectivity) wired into `packages/api/src/app.module.ts`, per `packages/api/CLAUDE.md`'s "Local dev" section
- [X] T016 Add Liquibase changeset `packages/api/migrations/0010-seed-test-user.sql` inserting the one preloaded test account with a pre-computed Argon2id hash of a fixed password, with a rollback, and include it in `packages/api/migrations/db.changelog-master.yaml`, per `research.md` §8
- [X] T017 Amend `packages/api/swagger/openapi_pet_store.json`: add `"security": [{"api_key": []}]` to the `logoutUser`, `getUserByName`, `updateUser`, and `deleteUser` operations only, per `contracts/user-api.md`
- [X] T018 Add `valkey` and `api` services to root `docker-compose.yml` (`valkey` with a healthcheck; `api` built from `packages/api/Dockerfile`, `depends_on: liquibase: service_completed_successfully` and `valkey: service_healthy`, reading `DATABASE_URL`/`VALKEY_URL`/`API_KEY_TTL_SECONDS`/`PORT` from env)

**Checkpoint**: `docker compose up --build` brings up `postgres` → `liquibase` (now including the seed changeset) → `valkey` → `api`, and `api`'s health endpoint reports healthy. No user-facing endpoints exist yet.

---

## Phase 3: User Story 1 - Authenticate and receive an API key (Priority: P1) 🎯 MVP

**Goal**: A user can sign in with a username/password and receive an API key.

**Independent Test**: Sign in as the seeded test account (T016) with correct credentials and
confirm an API key is returned; sign in with a wrong password or unknown username and confirm it
is refused identically either way.

### Implementation for User Story 1

- [X] T019 [P] [US1] Create `LoginQueryDto` (`username`, `password` query params) in `packages/api/src/user/dto/login-query.dto.ts`
- [X] T020 [US1] Wire `UserModule` (`user.module.ts`) registering `UserRepository`, `UserService`, `UserController`, `PasswordHasherService`, `ApiKeyStoreService` as providers, and import it in `packages/api/src/app.module.ts`
- [X] T021 [US1] Implement `UserService.login(username, password)` in `packages/api/src/user/user.service.ts` — looks up the account via `UserRepository`, verifies via `PasswordHasherService`, issues a key via `ApiKeyStoreService` on success, and throws an identical "invalid credentials" error for both an unknown username and a wrong password (FR-004/FR-005)
- [X] T022 [US1] Implement `UserController.loginUser` (`GET /user/login`) in `packages/api/src/user/user.controller.ts`, returning the issued key as a bare JSON string per `contracts/user-api.md`

### Tests for User Story 1

- [X] T023 [P] [US1] Unit test `UserService.login` (mocked `UserRepository`/`PasswordHasherService`/`ApiKeyStoreService`: success, wrong password, unknown username) in `packages/api/test/user.service.spec.ts`
- [X] T024 [US1] e2e test (`testcontainers` Postgres + Valkey, real Nest app) covering login success and both failure cases against the seeded test account, in `packages/api/test/user.e2e-spec.ts`

**Checkpoint**: User Story 1 is independently functional — sign-in against the seeded test
account works end-to-end, and `quickstart.md` step 3 can be run.

---

## Phase 4: User Story 2 - Manage a user account (Priority: P2)

**Goal**: Create, retrieve, update, and delete user accounts, gated by the API key from User
Story 1 for everything except creation.

**Independent Test**: Create a new account, fetch it by username, update a field, delete it, and
confirm it's gone — all using an API key obtained via User Story 1's login.

### Implementation for User Story 2

- [X] T025 [P] [US2] Create `CreateUserDto` in `packages/api/src/user/dto/create-user.dto.ts`
- [X] T026 [P] [US2] Create `UpdateUserDto` in `packages/api/src/user/dto/update-user.dto.ts`
- [X] T027 [P] [US2] Create `UserResponseDto` (excludes `password`) in `packages/api/src/user/dto/user-response.dto.ts`
- [X] T028 [US2] Extend `UserService` in `packages/api/src/user/user.service.ts` with `create` (hashes the password via `PasswordHasherService`, rejects a case/whitespace-insensitive username collision per Edge Cases), `getByUsername`, `update`, and `delete` methods (depends on T021/T025-T027)
- [X] T029 [US2] Extend `UserController` in `packages/api/src/user/user.controller.ts` with `createUser` (open), and `getUserByName`/`updateUser`/`deleteUser` (`@UseGuards(ApiKeyGuard)`), mapping to `UserResponseDto` (depends on T022, T028)

### Tests for User Story 2

- [X] T030 [P] [US2] Unit tests for `UserService.create`/`getByUsername`/`update`/`delete`, including the username-collision case, in `packages/api/test/user.service.spec.ts`
- [X] T031 [US2] Extend the e2e suite in `packages/api/test/user.e2e-spec.ts`: create → get → update → delete happy path, a duplicate-username rejection, a 401 on a protected route with no/invalid key, and a 404 on an unknown username

**Checkpoint**: User Stories 1 AND 2 both work independently — full account lifecycle, protected
by the API key. `quickstart.md` steps 3–4 and 7 can be run.

---

## Phase 5: User Story 3 - End a session / let it expire (Priority: P3)

**Goal**: A signed-in user can explicitly log out (immediate key invalidation), or let their key
expire on its own after the TTL window.

**Independent Test**: Sign in, sign out, and confirm the key is rejected immediately after; and
separately, sign in and confirm the key stops working once its TTL elapses (validated with a
short TTL override, not a real 30-minute wait).

### Implementation for User Story 3

- [X] T032 [US3] Extend `UserController` with `logoutUser` (`GET /user/logout`, `@UseGuards(ApiKeyGuard)`) in `packages/api/src/user/user.controller.ts`, calling `ApiKeyStoreService.revoke` on the caller's own presented token (depends on T029)
- [X] T033 [US3] Add a short-TTL override path for tests (`API_KEY_TTL_SECONDS` read from test env config, e.g. `2`) in the e2e test bootstrap in `packages/api/test/user.e2e-spec.ts`, per `research.md` §10

### Tests for User Story 3

- [X] T034 [P] [US3] Unit test `ApiKeyGuard` + `ApiKeyStoreService.revoke` (valid key, revoked key, expired key, key for a since-deleted user) in `packages/api/test/api-key.guard.spec.ts`
- [X] T035 [US3] Extend the e2e suite in `packages/api/test/user.e2e-spec.ts`: logout immediately invalidates the key (0% success rate on reuse, per SC-004), and the short-TTL override case confirms expiry without a manual 30-minute wait (per SC-003)

**Checkpoint**: All three user stories are independently functional — the full login → protected
use → logout/expiry lifecycle from `spec.md` is covered. `quickstart.md` steps 3–6 can all be run.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish the deliverables that span every story rather than belonging to one.

- [X] T036 [P] Write `README.md` at the repo root: environment setup, `docker compose up`, how to create an account, how to log in and use the resulting API key, and the preloaded test account's username/password (FR-012/FR-013)
- [X] T037 Run `quickstart.md` end-to-end against the full `docker compose up --build` stack and fix any drift found between it and the actual behavior
- [X] T038 [P] Wire a `test:e2e` script at the `packages/api` workspace level (and a passthrough at the repo root) so `npm run test:e2e --workspace packages/api` (referenced by `quickstart.md` step 6) actually runs the `testcontainers`-backed suite

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. This is the MVP slice.
- **User Story 2 (Phase 4)**: Depends on Foundational; extends the same `user.service.ts`/
  `user.controller.ts` files US1 created, so in practice it starts after US1 lands those files,
  even though its *behavior* (account CRUD) doesn't depend on login succeeding first.
- **User Story 3 (Phase 5)**: Depends on Foundational; extends the same controller file again
  (adds `logoutUser`) and reuses `ApiKeyStoreService`/`ApiKeyGuard` from Foundational — no
  behavioral dependency on US2, only a file-sharing one.
- **Polish (Phase 6)**: Depends on whichever stories are in scope for the release being prepared.

### Parallel Opportunities

- All `[P]` Setup tasks (T002–T004) can run together once T001 exists.
- All `[P]` Foundational tasks (T007–T010, T014) can run together once T006 exists; T011–T013,
  T015–T018 have the specific dependencies noted inline above.
- Within each story, all `[P]` DTO/test tasks can run together; the `UserService`/
  `UserController` edits within a story are sequential (same file).
- Because US2 and US3 both extend `user.controller.ts` (and US2 also extends `user.service.ts`),
  true cross-story parallelism is limited to different developers coordinating on those shared
  files — not a blocker, just not a clean parallel split without that coordination.

---

## Parallel Example: Foundational Phase

```bash
# Once T006 (env validation) exists, these can run together:
Task: "Implement the Kysely database provider in packages/api/src/database/database.module.ts"
Task: "Author the Database interface in packages/api/src/database/types.ts"
Task: "Implement PasswordHasherService in packages/api/src/security/password-hasher.service.ts"
Task: "Implement the Valkey client provider in packages/api/src/security/valkey.module.ts"
Task: "Implement the shared HTTP exception filter in packages/api/src/common/filters/http-exception.filter.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Create LoginQueryDto in packages/api/src/user/dto/login-query.dto.ts"
Task: "Unit test UserService.login in packages/api/test/user.service.spec.ts"  # after T021 lands
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (critical — blocks everything).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run `quickstart.md` steps 1–3 against the seeded test account.
5. Demo: sign-in issuing an API key, backed by Valkey with a real 30-minute TTL.

### Incremental Delivery

1. Setup + Foundational → stack boots, no user-facing endpoints yet.
2. + User Story 1 → sign-in works (MVP).
3. + User Story 2 → full account CRUD, protected by the key from Story 1.
4. + User Story 3 → sessions can be ended early or left to expire; auth lifecycle complete.
5. + Polish → README, `quickstart.md` verified, e2e script wired for CI.

---

## Notes

- `[P]` tasks touch different files and have no unmet dependencies.
- `[Story]` labels map every user-story-phase task back to `spec.md`'s US1/US2/US3.
- Tests are included per the repo constitution's real-database integration-test requirement, not
  because `spec.md` requested TDD — see the **Tests** note at the top of this file.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently before moving to the next.
