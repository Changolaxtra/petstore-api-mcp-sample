---

description: "Task list for Interactive API Documentation (Swagger UI)"

---

# Tasks: Interactive API Documentation (Swagger UI)

**Input**: Design documents from `/specs/003-swagger-ui-docs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included for the same reason as `specs/002-user-api-key-auth/tasks.md` — the project
constitution's real-infrastructure testing conventions, not because `spec.md` requested TDD. This
feature is small enough that most of its behavior comes for free from `@nestjs/swagger` once it's
given the right document; User Story 2's task is therefore a manual browser verification against
`quickstart.md`, per this project's own UI-testing convention (exercise the actual page before
calling it done), rather than a redundant automated re-test of library behavior already covered
elsewhere.

**Organization**: Setup → Foundational → US1 → US2 → Polish, per `spec.md`'s two user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Setup

- [X] T001 [P] Update `packages/api/Dockerfile`'s runtime stage to also `COPY packages/api/swagger packages/api/swagger` (alongside the existing `dist/` copy), per `research.md` §5 — otherwise `/docs` will `ENOENT` once the document is read from disk at runtime, but only inside the container

**Checkpoint**: Docker runtime image carries the contract file; no other change yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one piece of infrastructure both user stories depend on — serving the *correct*
document is what makes both "browse" and "try it out" work at all.

**⚠️ CRITICAL**: No user story task may start until this phase is complete.

- [X] T002 Implement `buildOpenApiDocument()` in `packages/api/src/docs/build-openapi-document.ts`: resolve `packages/api/swagger/openapi_pet_store.json` via `path.join(__dirname, '..', 'swagger', 'openapi_pet_store.json')`, `JSON.parse` it, and return it with `servers` overridden to `[{ url: '/' }]`, per `research.md` §1–2 and `contracts/docs-endpoints.md`
- [X] T003 Update `packages/api/src/main.ts`: replace the `DocumentBuilder`/`SwaggerModule.createDocument(app, config)` call with `SwaggerModule.setup('docs', app, buildOpenApiDocument())`, removing the now-unused `DocumentBuilder` import and the `.addApiKey(...)` call (the committed contract's own `components.securitySchemes.api_key` already provides this) (depends on T002)
- [X] T004 [P] Unit test `buildOpenApiDocument()` in `packages/api/test/build-openapi-document.spec.ts`: assert its return value deep-equals the real `packages/api/swagger/openapi_pet_store.json` contents with only `servers` replaced by `[{ url: '/' }]` — a direct comparison against the file on disk, not a hand-copied expected value, per `research.md` §7 (depends on T002)

**Checkpoint**: `/docs` now serves the committed contract (modulo `servers`); both user stories can proceed.

---

## Phase 3: User Story 1 - Browse the API's documented operations (Priority: P1) 🎯 MVP

**Goal**: Anyone opening `/docs` sees every pet/store/user operation, correctly grouped, with its
method, path, parameters, and response shapes — and can see which operations need an API key.

**Independent Test**: Open `/docs` on a running server and confirm every operation from the
committed contract appears, with protected `user` operations showing a lock icon.

### Implementation for User Story 1

- [X] T005 [US1] Add e2e assertions in `packages/api/test/user.e2e-spec.ts` (reusing the app/containers that file already boots — no new `testcontainers` setup): `GET /docs` returns `200` with an HTML body; `GET /docs-json` returns `200` with a body deep-equal to `buildOpenApiDocument()`'s output, confirming every `pet`/`store`/`user` path and the `api_key` security requirement on the four protected `user` operations are present, per `contracts/docs-endpoints.md`

**Checkpoint**: User Story 1 is independently verified — `quickstart.md` step 1 passes.

---

## Phase 4: User Story 2 - Try an operation directly from the page (Priority: P2)

**Goal**: A user can fill in parameters (and, for protected operations, an API key) on the page
itself and see the real request's real response — not a client-side mock.

**Independent Test**: From `/docs`, create an account, log in, use "Authorize" with the returned
key, then successfully call a protected operation; repeat without a key and see a real `401`.

### Implementation for User Story 2

- [X] T006 [US2] Manually walk through `quickstart.md` §2–3 in a browser against a running server (`docker compose up` or `npm run start:dev`): try `POST /user` (open), try `GET /user/login` (open) to obtain a key, use "Authorize" with that key, try `GET /user/{username}` (protected) and confirm a real `200`, then clear the key and confirm a real `401` — per this project's convention of exercising UI features in a browser before calling them done. No new backend code is expected here: the create/login/get/401 behavior is already covered by `specs/002-user-api-key-auth`'s e2e suite, and T002–T004 are what make that behavior reachable and correctly authorized from the page

**Checkpoint**: User Story 2 is independently verified — `quickstart.md` steps 2–3 pass.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T007 [P] Update the root `README.md`'s existing `/docs` mention to note that the page supports "Try it out" with an "Authorize" action for the `api_key` header, so a reader knows it's not just a static reference
- [X] T008 Run `quickstart.md` end-to-end against a freshly built `docker compose up --build` stack (confirming T001's Dockerfile fix) and fix any drift found, including re-running `npm run test` and `npm run test:e2e --workspace packages/api`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup only in the sense that T001 and T002/T003 touch
  unrelated files and can proceed in parallel; T004 depends on T002.
- **User Story 1 (Phase 3)**: Depends on Foundational (needs the corrected document being served).
- **User Story 2 (Phase 4)**: Depends on Foundational; not on User Story 1 — it's independently
  verifiable (a fresh browser session can go straight to `/user/login` without first confirming
  the page's listing is complete), though in practice a developer will naturally do both from the
  same open tab.
- **Polish (Phase 5)**: Depends on both user stories being verified.

### Parallel Opportunities

- T001 (Setup) and T002 (Foundational) touch different files and can run together.
- T004 can run as soon as T002 lands, in parallel with T003.
- T007 (Polish) has no dependency on T008 and can run in parallel with it.

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement buildOpenApiDocument() in packages/api/src/docs/build-openapi-document.ts"
Task: "Update packages/api/Dockerfile runtime stage to copy packages/api/swagger/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: open `/docs`, confirm every operation is listed correctly.

### Incremental Delivery

1. Setup + Foundational → `/docs` serves the correct, drift-proof document.
2. + User Story 1 → confirmed browsable (MVP).
3. + User Story 2 → confirmed usable for real calls, including authorized ones.
4. + Polish → README updated, full stack re-validated.

---

## Notes

- This feature is small by design: most of its user-facing behavior comes for free from
  `@nestjs/swagger` once given a correct document, so the task list is concentrated in the
  Foundational phase rather than padded with redundant per-story implementation tasks.
- Commit after each task or logical group.
