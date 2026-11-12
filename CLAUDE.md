# Petstore API + MCP Sample

TypeScript monorepo demonstrating a NestJS REST API (Swagger Petstore) paired with an MCP server that exposes the same domain as LLM-callable tools over HTTP. No feature spec/plan exists yet — this file (and the per-package ones below) describes the intended architecture directly; once Spec Kit features are created, prefer their plans for feature-specific detail.

## Structure
```
packages/
  api/      NestJS REST API (TypeScript, PostgreSQL-backed); OpenAPI contract in packages/api/swagger/
  mcp/      LeanMCP server (TypeScript); exposes pet/store/user ops as MCP tools; talks to packages/api over HTTP
.specify/   GitHub Spec Kit (spec-driven development) config, constitution, templates
```
Each package has its own `CLAUDE.md` with stack-specific conventions — read it before touching that package:
- [packages/api/CLAUDE.md](packages/api/CLAUDE.md)
- [packages/mcp/CLAUDE.md](packages/mcp/CLAUDE.md)

## Tech stack
| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (`strict: true`), both packages |
| API framework | NestJS |
| Database | PostgreSQL |
| DB access | Kysely — type-safe SQL builder (the closest Node/TS equivalent to jOOQ) |
| Schema migrations | Liquibase (formatted SQL changelogs), applied before Kysely ever reads the schema |
| API contract | OpenAPI 3.0, `packages/api/swagger/openapi_pet_store.json` |
| MCP framework | LeanMCP (`@leanmcp/core`), decorator-based tools |
| API↔MCP transport | HTTP (the MCP package is an HTTP client of the API package; it never touches the DB directly) |
| Local orchestration | Docker Compose |
| Spec-driven dev | GitHub Spec Kit (`.specify/`, `speckit-*` skills) |

<!-- SPECKIT START -->
Active plan: `specs/004-complete-pet-store-api/plan.md`.
For additional context about technologies to be used, project structure,
shell commands, and other important information, read that plan (and its
`research.md` / `data-model.md` / `contracts/` / `quickstart.md` siblings).
<!-- SPECKIT END -->

## Spec-driven development (Spec Kit)
This repo uses GitHub Spec Kit to drive feature work. For any non-trivial feature:
1. `/speckit.constitution` — keep `.specify/memory/constitution.md` filled in and current (it is still a template — fill it in before relying on it).
2. `/speckit.specify` — write the feature spec.
3. `/speckit.clarify` — resolve ambiguities before planning.
4. `/speckit.plan` — produce the implementation plan.
5. `/speckit.tasks` — break the plan into tasks.
6. `/speckit.implement` — execute the tasks.
Specs/plans/tasks live under `specs/<feature>/`. Always check for an existing plan there before starting work ad hoc.

## Monorepo conventions
- TypeScript (`strict: true`) in every package's `tsconfig.json` — no `.js` sources.
- npm workspaces (`packages/*`); add pnpm/Turborepo only if build-caching actually becomes a bottleneck — don't pre-adopt it.
- One lint/format config at the root (ESLint + Prettier), extended by each package — don't fork rules per package.
- Conventional Commits for commit messages.
- Node LTS version pinned via `.nvmrc` / `engines` in root `package.json`.

## Docker Compose
Both packages run via `docker compose up` from the repo root (compose file at the repo root once scaffolded, not per-package). Expected services:
- `postgres` — PostgreSQL, named volume for data, health-checked before `liquibase` runs.
- `liquibase` — one-shot `liquibase/liquibase` image applying `packages/api/migrations/db.changelog-master.yaml`, `depends_on: postgres: condition: service_healthy`, exits 0 on success. Runs on **every** `docker compose up` against the `postgres` container, not just the first time it's created — never gate this behind a "first run only" check or a seed flag.
- `api` — NestJS app, `depends_on: liquibase: condition: service_completed_successfully`, exposes its HTTP port, reads DB connection + port from env. This also means `api` never comes up against a `postgres` container that hasn't just had the changelog (re)applied.
- `mcp` — LeanMCP app, depends on `api` being healthy, reads `API_BASE_URL=http://api:<port>` from env, never gets direct DB credentials.
Keep per-service env in `.env`/`.env.example` files per package, not hardcoded in the compose file.

Running the full changelog on every startup is safe and intentional: Liquibase tracks applied changesets in its own `DATABASECHANGELOG` table in the target DB, so a rerun against an already-migrated database is a no-op (it only applies changesets it hasn't seen before). Don't try to "optimize" this by skipping the `liquibase` service conditionally — that's exactly the Liquibase feature this relies on.

## Cross-cutting best practices
- The OpenAPI spec in `packages/api/swagger/` is the single source of truth for the HTTP contract. Both the API's generated docs and the MCP package's HTTP client should be generated/validated from it — don't hand-maintain duplicate type definitions in both packages.
- Never let `packages/mcp` reach into the database or import anything from `packages/api`'s internals — it only talks HTTP.
- Secrets (DB credentials, etc.) only via environment variables / `.env` (gitignored), never committed.
- Favor small, reviewable PRs aligned to one spec-kit task at a time.
