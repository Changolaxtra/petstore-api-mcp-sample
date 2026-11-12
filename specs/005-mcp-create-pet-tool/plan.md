# Implementation Plan: MCP Server Scaffold with Create-Pet Tool

**Branch**: `main` (no feature branch created for this planning run — no `before_specify` branch hook is enabled; the spec/plan live directly under `specs/005-mcp-create-pet-tool/`) | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-mcp-create-pet-tool/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Scaffold `packages/mcp` as a standalone LeanMCP server exposing exactly one tool, `create_pet`, which validates its input and calls the existing NestJS Petstore API over HTTP (never the database directly) to create a pet record. The server must be independently discoverable and callable via MCP Inspector, must authenticate its own outbound calls to the API using the API's existing `api_key` header scheme (obtained via `/user/login`, cached, and refreshed on expiry — never exposed to the calling agent), and must run as its own container, sibling to `api`, in the root Docker Compose file. Documentation ships alongside the scaffold explaining how to point Claude Desktop (and other MCP-compatible agents) at the running server via a JSON config snippet.

## Technical Context

**Language/Version**: TypeScript 5.7 (`strict: true`), Node.js 22 (matches root `engines`/`.nvmrc`)

**Primary Dependencies**: `@leanmcp/core` (MCP tool framework, Streamable HTTP transport), `axios` + `axios-retry` (HTTP client to the API), `zod` (env var validation, consistent with `packages/api`), `openapi-typescript` (dev-time codegen of request/response types from the committed OpenAPI contract)

**Storage**: N/A — this package holds no persistent storage; the only in-memory state is a cached API key obtained from the API's own login endpoint

**Testing**: Jest (unit), with `axios-mock-adapter` or `nock` to stub the API HTTP client; manual/exploratory verification via MCP Inspector per `quickstart.md`

**Target Platform**: Linux container (Docker Compose), Node 22 runtime

**Project Type**: Single backend service (MCP tool server) — maps to the monorepo's existing "Option 1"-style package layout, not a web/mobile split

**Performance Goals**: Not a scale-sensitive feature; a `create_pet` call should add negligible overhead (sub-second, excluding the API's own latency) on top of a single downstream HTTP call

**Constraints**: Must never access PostgreSQL directly or import `packages/api` internals (Principle III); must not retry the non-idempotent create-pet call on failure; must not expose the API credential to the calling agent/end user; must run as an independently startable/stoppable container from `api`

**Scale/Scope**: Exactly one tool (`create_pet`) in this feature; single-instance local/dev deployment, no concurrency or multi-tenancy requirements beyond what Express/LeanMCP provide out of the box

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Contract-First Development | PASS | `create_pet`'s request/response types are generated from `packages/api/swagger/openapi_pet_store.json` via `openapi-typescript`, not hand-written. The tool's input schema mirrors the `Pet` schema's required fields (`name`, `photoUrls`). |
| II. Liquibase Owns the Schema | N/A | `packages/mcp` has no database and makes no schema changes. |
| III. Package Boundaries Are HTTP, Not Imports | PASS | `packages/mcp` talks to `packages/api` only through a single shared Axios client; no DB credentials, no imports of `packages/api` source. |
| IV. Typed, Explicit Data Access | PASS (by scope) | `packages/mcp`'s own `tsconfig.json` runs `strict: true`, consistent with every other package. No data-access layer applies here since there is no database. |
| V. Spec-Driven Delivery | PASS | This feature is going through specify → plan → tasks → implement; this Constitution Check gate is being evaluated before Phase 0 and will be re-checked after Phase 1. |

No violations identified. **Complexity Tracking is not needed for this plan.**

**Post-Phase 1 re-check**: Design artifacts (`research.md`, `data-model.md`, `contracts/create-pet-tool.md`, `quickstart.md`) introduced no database access, no cross-package imports, and no hand-maintained duplicate types — the gate outcomes above are unchanged after design.

## Project Structure

### Documentation (this feature)

```text
specs/005-mcp-create-pet-tool/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── create-pet-tool.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

**Structure Decision**: Single new package, `packages/mcp`, added as a sibling to the existing `packages/api` inside the npm workspaces monorepo — following the layout already documented in `packages/mcp/CLAUDE.md`. No frontend/mobile structure applies; this is a backend-only tool server.

```text
packages/mcp/
├── main.ts                        # Entry point; boots the LeanMCP Streamable HTTP server
├── mcp/
│   ├── pet/
│   │   ├── pet.service.ts         # PetService — @Tool create_pet
│   │   └── dto/
│   │       └── create-pet.input.ts   # @SchemaConstraint-annotated input class
│   └── http/
│       ├── api-client.ts          # Shared Axios instance (base URL, timeout, retry policy)
│       ├── auth.ts                # Login + in-memory API key cache/refresh against /user/login
│       └── types.generated.ts     # Generated from packages/api/swagger/openapi_pet_store.json
├── config/
│   └── env.ts                     # zod-validated env schema (API_BASE_URL, MCP credentials, PORT)
├── test/
│   └── pet.service.spec.ts        # Unit test with the Axios client mocked
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example

docker-compose.yml                  # Updated: new `mcp` service, sibling to `api`
CLAUDE.md                           # Updated: README-level pointer to MCP agent-connection docs (if applicable)
docs/ (or packages/mcp/README.md)   # Documentation: connecting Claude/other agents via JSON config
```

## Complexity Tracking

> No entries — Constitution Check reported no violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _none_ | — | — |
