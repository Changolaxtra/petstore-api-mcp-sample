# Tasks: MCP Server Scaffold with Create-Pet Tool

**Input**: Design documents from `/specs/005-mcp-create-pet-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/create-pet-tool.md, quickstart.md

**Tests**: Not explicitly requested as TDD in the feature spec, but `packages/mcp/CLAUDE.md` already documents "unit test each tool/service with the Axios client mocked" as a standing package convention — unit test tasks are included below to satisfy that existing convention, not as a new ask.

**Organization**: Tasks are grouped by user story (from `spec.md`: US1 = P1 discovery, US2 = P2 agent-driven creation incl. error handling, US3 = P3 agent-connection documentation) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths below are project-relative

## Path Conventions

Single new package in the existing npm-workspaces monorepo: `packages/mcp/` (sibling to `packages/api/`), plus root-level `docker-compose.yml` / `.env.example` updates — per `plan.md`'s Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the `packages/mcp` package and its container/orchestration wiring so there is somewhere for foundational and story code to live.

- [X] T001 Create the `packages/mcp` package skeleton: `package.json` (name `@petstore/mcp`, scripts for `build`/`start`/`start:dev`/`lint`/`test`/`codegen`, dependencies `@leanmcp/core`, `axios`, `axios-retry`, `zod`; dev dependencies `openapi-typescript`, `jest`, `ts-jest`, `@types/jest`, `@types/node`, `axios-mock-adapter`, `typescript`), `tsconfig.json` (extends `../../tsconfig.base.json`, matching `packages/api/tsconfig.json`'s pattern), and empty directories `mcp/pet/dto/`, `mcp/http/`, `config/`, `test/` in `packages/mcp/`
- [X] T002 [P] Create `packages/mcp/Dockerfile`, a multi-stage build mirroring `packages/api/Dockerfile` (build stage `npm ci` + `npm run build --workspace packages/mcp`, runtime stage `npm ci --omit=dev` + `node dist/main.js`, `EXPOSE` the configured port)
- [X] T003 [P] Add an `mcp` service to `docker-compose.yml`, sibling to `api`: `build.dockerfile: packages/mcp/Dockerfile`, `depends_on: api: condition: service_healthy`, `environment: API_BASE_URL, MCP_API_USERNAME, MCP_API_PASSWORD, PORT` (no database credentials), `ports` for its own port — per the root `CLAUDE.md`'s Docker Compose section and Constitution Principle III
- [X] T004 [P] Add `MCP_PORT`, `API_BASE_URL`, `MCP_API_USERNAME`, `MCP_API_PASSWORD` to the root `.env.example`, and create `packages/mcp/.env.example` with the host-local equivalents (`API_BASE_URL=http://localhost:3000`), following the pattern already used by `packages/api/.env.example`

**Checkpoint**: `packages/mcp` exists as an installable, buildable, composable package with no implementation yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared HTTP/auth/server plumbing every user story's `create_pet` tool depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Generate `packages/mcp/mcp/http/types.generated.ts` from `packages/api/swagger/openapi_pet_store.json` using `openapi-typescript`, and add the `codegen` script in `packages/mcp/package.json` that regenerates it (Constitution Principle I; `research.md` §3)
- [X] T006 [P] Implement a zod-validated env schema in `packages/mcp/config/env.ts` covering `API_BASE_URL`, `MCP_API_USERNAME`, `MCP_API_PASSWORD`, `PORT` (`plan.md` Project Structure; mirrors `packages/api`'s `@nestjs/config` + zod convention)
- [X] T007 Implement the login/API-key cache module in `packages/mcp/mcp/http/auth.ts`: calls `GET /user/login` on the API using `MCP_API_USERNAME`/`MCP_API_PASSWORD` from `config/env.ts`, caches the returned `api_key` in memory, and exposes a way to force re-login (depends on T006; `research.md` §4)
- [X] T008 Implement the shared Axios client in `packages/mcp/mcp/http/api-client.ts`: base URL from `API_BASE_URL`, explicit timeout, `axios-retry` bounded to idempotent GET requests only, attaches the `api_key` header via `mcp/http/auth.ts`, and re-logs-in once and retries on a `401` (depends on T005, T006, T007; `research.md` §2, §4)
- [X] T009 [P] Boot the LeanMCP Streamable HTTP server entry point in `packages/mcp/main.ts`, listening on `PORT` from `config/env.ts` and serving MCP at `/mcp` (depends on T006; `research.md` §1)

**Checkpoint**: The server starts, can reach the API, and can authenticate against it — no tool is registered yet.

---

## Phase 3: User Story 1 - Discover the tool server during development (Priority: P1) 🎯 MVP

**Goal**: A developer can start the server standalone, connect with MCP Inspector, see `create_pet` listed with a usable description/input schema, and successfully invoke it with valid sample data.

**Independent Test**: Start the server with no agent attached, connect MCP Inspector to `http://localhost:<port>/mcp`, confirm `create_pet` is listed, and invoke it with a valid name + photo URL to see a successful result.

### Implementation for User Story 1

- [X] T010 [P] [US1] Create the `CreatePetInput` DTO with `@SchemaConstraint`-annotated fields (`name` required, `photoUrls` required array, `category`/`tags`/`status` optional) in `packages/mcp/mcp/pet/dto/create-pet.input.ts`, per `data-model.md`'s `CreatePetInput` and `contracts/create-pet-tool.md`'s input schema
- [X] T011 [US1] Implement `PetService.createPet`'s success path as an `@Tool('create_pet', ...)` handler in `packages/mcp/mcp/pet/pet.service.ts`: calls `POST /pet` via the shared Axios client and maps the response to the `Pet` output shape from `data-model.md` (depends on T008, T010)
- [X] T012 [US1] Register `PetService` with the LeanMCP server bootstrap in `packages/mcp/main.ts` so `create_pet` is auto-discovered (depends on T009, T011)
- [X] T013 [P] [US1] Unit test `PetService.createPet`'s success path, with the Axios client mocked (`axios-mock-adapter`), in `packages/mcp/test/pet.service.spec.ts`
- [X] T014 [US1] Manually verify tool discovery and a successful invocation using MCP Inspector, following `quickstart.md` steps 1–3 (depends on T012)

**Checkpoint**: `create_pet` is discoverable and callable end-to-end for the happy path — MVP demoable.

---

## Phase 4: User Story 2 - Create a pet record through an AI agent (Priority: P2)

**Goal**: An agent-driven `create_pet` call creates a real pet record on success, and every failure mode (missing required input, API rejection, API unreachable) comes back as a clear error instead of a crash or silent failure.

**Independent Test**: With the server connected to an agent (or MCP Inspector standing in for one), request pet creation with valid data and confirm the record exists via the API; then repeat with missing required fields, with the API returning an error, and with the API stopped, confirming each produces a clear, distinct failure.

### Implementation for User Story 2

- [X] T015 [P] [US2] Add required-field validation to `create_pet` (reject missing/empty `name` or empty `photoUrls` with a `ToolError` of `cause: "validation"` before any API call) in `packages/mcp/mcp/pet/pet.service.ts` / `create-pet.input.ts`, per `data-model.md`'s `CreatePetInput` validation rule
- [X] T016 [P] [US2] Implement an error-mapping module in `packages/mcp/mcp/http/error-mapper.ts` that translates Axios 4xx/5xx responses and network/timeout errors into the `ToolError{message, cause}` shape from `data-model.md`, so no raw Axios exception/stack trace is ever returned to the caller
- [X] T017 [US2] Wire validation (T015) and error mapping (T016) into `PetService.createPet` in `packages/mcp/mcp/pet/pet.service.ts` so all three failure modes (`validation`, `api_error`, `unreachable`) surface as MCP tool errors matching `contracts/create-pet-tool.md` (depends on T015, T016)
- [X] T018 [P] [US2] Unit tests for `PetService.createPet`'s failure paths (missing `name`, empty `photoUrls`, API 4xx, API 5xx, network/unreachable) in `packages/mcp/test/pet.service.spec.ts`
- [X] T019 [US2] Manually verify the failure paths (missing required field, API stopped) using MCP Inspector, following `quickstart.md` step 4 (depends on T017)

**Checkpoint**: `create_pet` now handles both success and every documented failure mode end-to-end.

---

## Phase 5: User Story 3 - Connect an agent to the tool server using provided documentation (Priority: P3)

**Goal**: A developer unfamiliar with the project can connect Claude Desktop (or another MCP-compatible agent) to the running server using only written documentation.

**Independent Test**: Using only `packages/mcp/README.md` and a running server, configure a supported agent to connect, and confirm it lists `create_pet` without the developer reading any source code.

### Implementation for User Story 3

- [X] T020 [P] [US3] Write `packages/mcp/README.md` documenting what `create_pet` does, how to run the server (local + Docker Compose), and a copy-pasteable Claude Desktop `mcpServers` JSON config snippet pointing at `http://localhost:<port>/mcp`, per `data-model.md`'s `AgentConnectionConfig` and `research.md` §6
- [X] T021 [US3] Manually verify an MCP-compatible agent can connect using only `packages/mcp/README.md`'s instructions and see `create_pet` listed, following `quickstart.md` step 5 (depends on T020, T012)

**Checkpoint**: All three user stories are independently functional — discovery, agent-driven creation with error handling, and documented agent connection.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final checks spanning all stories.

- [X] T022 [P] Run `npm run lint` and `npm run format` at the repo root and fix any findings in `packages/mcp`, confirming it conforms to the shared root ESLint/Prettier config without a forked configuration
- [X] T023 Run the full `quickstart.md` validation end-to-end against the Docker Compose stack (all steps 1–5), confirming every Success Criteria mapping in that document holds (depends on T001–T021)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion.
  - US2 and US3 both build on the `create_pet` tool registered in US1 (T011/T012) — they are not independent of US1 the way a typical multi-story feature's stories are, since this feature has exactly one tool. They remain independently *testable* (US2 adds failure-mode coverage to the same tool; US3 adds documentation), per each story's Independent Test above.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- DTO/model before service implementation.
- Service implementation before server registration.
- Server registration before manual Inspector verification.
- Unit tests may be written alongside (not strictly before) implementation, since no TDD approach was requested.

### Parallel Opportunities

- Setup: T002, T003, T004 can run in parallel once T001 exists.
- Foundational: T005 and T006 can run in parallel; T007 depends on T006; T008 depends on T005/T006/T007; T009 depends only on T006 and can run in parallel with T007/T008.
- US1: T010 can run in parallel with Foundational-phase cleanup; T013 (unit test) can run in parallel with T012 once T011 exists.
- US2: T015 and T016 touch different files and can run in parallel; T018 can run in parallel with T017.
- US3: T020 has no code dependency and can start as soon as the contract (`contracts/create-pet-tool.md`) is stable — i.e., anytime after Phase 2.

---

## Parallel Example: Foundational Phase

```bash
# Launch independent foundational tasks together:
Task: "Generate packages/mcp/mcp/http/types.generated.ts from the OpenAPI contract"
Task: "Implement zod-validated env schema in packages/mcp/config/env.ts"
```

## Parallel Example: User Story 2

```bash
# Launch independent User Story 2 tasks together:
Task: "Add required-field validation to create_pet in packages/mcp/mcp/pet/pet.service.ts"
Task: "Implement error-mapping module in packages/mcp/mcp/http/error-mapper.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: confirm `create_pet` is discoverable and callable via MCP Inspector (quickstart.md steps 1–3).
5. Deploy/demo if ready — this is already a usable scaffold proving the architecture end-to-end.

### Incremental Delivery

1. Setup + Foundational → server exists and can authenticate to the API.
2. Add User Story 1 → discoverable, callable happy path (MVP).
3. Add User Story 2 → robust against bad input and API/network failures.
4. Add User Story 3 → documented for Claude/other agents to self-serve a connection.
5. Polish → lint/format clean, full quickstart validated.

---

## Notes

- This feature intentionally scopes to one tool (`create_pet`); unlike a typical multi-story feature, US2 and US3 extend the same tool built in US1 rather than adding independent features — each story's own Independent Test still holds in isolation.
- [P] tasks touch different files with no completed-task dependency between them.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently before moving to the next.
