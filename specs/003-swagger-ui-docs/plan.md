# Implementation Plan: Interactive API Documentation (Swagger UI)

**Branch**: `003-swagger-ui-docs` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-swagger-ui-docs/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`packages/api/src/main.ts` already wires up `@nestjs/swagger` at `/docs`, but the served document
is built by `DocumentBuilder`/`SwaggerModule.createDocument()` reflecting over controller
decorators — a second, independently-derived description of the API that can silently diverge
from the committed `packages/api/swagger/openapi_pet_store.json`. This plan replaces that with
the committed file itself, read directly from disk and served as-is except for one deliberate
override (`servers`, so "Try it out" resolves against the real running server instead of the
public reference spec's `/api/v3` path). No new dependency is needed — `@nestjs/swagger` already
bundles the Swagger UI assets. The only other gap closed is that the Docker runtime image
currently doesn't carry `packages/api/swagger/` into the container, which would break `/docs`
under `docker compose up` once it's read from disk at runtime. See `research.md` for the full
reasoning behind each of these decisions.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`; Node.js 22.x — unchanged from
`specs/002-user-api-key-auth/plan.md`.

**Primary Dependencies**: `@nestjs/swagger` (already installed, already in use) — no new
dependency. No other package changes.

**Storage**: N/A — this feature introduces no persisted or session-backed state.

**Testing**: A unit test for the new `buildOpenApiDocument()` function (no Nest app, no
containers — a direct comparison against the real file on disk). Two additional assertions in
the existing `packages/api/test/user.e2e-spec.ts` (`GET /docs` → `200` HTML, `GET /docs-json` →
the expected document), reusing the app/containers that file already boots rather than paying
`testcontainers` startup cost again.

**Target Platform**: Same Docker Compose / Node 22 stack as the rest of `packages/api`.

**Project Type**: Backend web-service module within `packages/api` — a focused addition to the
existing NestJS app, not a new package.

**Performance Goals**: None beyond what Swagger UI itself already provides; the document is
built once at boot (a single synchronous file read + JSON parse), not per-request.

**Constraints**: The served document's operations, schemas, and security scheme MUST be read
verbatim from the committed contract file — only the top-level `servers` field may differ, and
only to point "Try it out" at the real running server instead of the public reference spec's
declared path (FR-006; `research.md` §1–2). The Docker runtime image MUST carry the contract file
into the container so `/docs` behaves identically there and in local dev (`research.md` §5).

**Scale/Scope**: One new small module (`src/docs/build-openapi-document.ts`), a `main.ts` edit, a
`Dockerfile` edit, one new unit test file, and two new assertions in an existing e2e test file.
No existing route, DTO, or database/Valkey behavior changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against Constitution v1.0.0:

- **I. Contract-First Development** — PASS, and this feature actively strengthens the project's
  adherence to this principle: the documentation page is made structurally incapable of drifting
  from `packages/api/swagger/openapi_pet_store.json`, closing a gap the prior `main.ts` left open
  (a decorator-reflected document that could diverge from the committed contract unnoticed).
- **II. Liquibase Owns the Schema** — N/A. No schema change; no migration added.
- **III. Package Boundaries Are HTTP, Not Imports** — N/A. `packages/mcp` is untouched; this
  feature is entirely within `packages/api`.
- **IV. Typed, Explicit Data Access** — N/A. No new database or Valkey access is introduced; the
  one new function (`buildOpenApiDocument()`) only reads a static JSON file from disk.
- **V. Spec-Driven Delivery** — PASS. `spec.md` (003) precedes this plan; this plan precedes
  `/speckit-tasks`/`/speckit-implement`.

No violations; Complexity Tracking table remains empty.

*Post-Phase 1 re-check*: `research.md`, `data-model.md`, and `contracts/` introduced nothing that
changes any of the above — still PASS (or N/A) on all five principles. The one design choice
worth surfacing here explicitly: overriding `servers` rather than adding a global `/api/v3`
prefix to match the committed contract's declared deployment path exactly. That fuller alignment
remains open as a separate, deliberate future feature if the team wants it (`research.md` §2) —
not something this plan silently decides on the team's behalf by expanding its own scope.

## Project Structure

### Documentation (this feature)

```text
specs/003-swagger-ui-docs/
├── plan.md                        # This file (/speckit-plan command output)
├── research.md                    # Phase 0 output (/speckit-plan command)
├── data-model.md                  # Phase 1 output (/speckit-plan command)
├── quickstart.md                  # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── docs-endpoints.md          # Phase 1 output — /docs, /docs-json, /docs-yaml
└── tasks.md                       # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/api/
├── src/
│   ├── main.ts                     # amended: build the served document via buildOpenApiDocument()
│   │                                 instead of DocumentBuilder/createDocument
│   └── docs/
│       └── build-openapi-document.ts   # new: reads swagger/openapi_pet_store.json, overrides `servers`
├── test/
│   ├── build-openapi-document.spec.ts  # new unit test
│   └── user.e2e-spec.ts                # amended: + GET /docs, + GET /docs-json assertions
├── Dockerfile                      # amended: runtime stage also COPYs packages/api/swagger/
└── swagger/
    └── openapi_pet_store.json      # unchanged — this is the file now served directly
```

**Structure Decision**: Everything lands inside `packages/api`; no root-level or `packages/mcp`
changes. The new `src/docs/` directory mirrors the existing one-concern-per-folder convention
(`src/security/`, `src/health/`) already used in this package.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
