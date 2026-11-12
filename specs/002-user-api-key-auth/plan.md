# Implementation Plan: User Account Operations & API Key Authentication

**Branch**: `002-user-api-key-auth` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-user-api-key-auth/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

This is the first feature to land actual application code in `packages/api` (until now it has
only `migrations/`, `swagger/`, and a `CLAUDE.md`), so it carries two layers of work: (1) the
baseline monorepo/NestJS scaffolding `packages/api/CLAUDE.md` already prescribes, and (2) the
feature itself — the `user` tag's HTTP operations (create/login/logout/get/update/delete) backed
by a Kysely repository against the existing `users` table, gated by an `api_key`-header guard
whose sessions live in a new `valkey` Compose service with a native 30-minute TTL, with passwords
hashed via Argon2id and one preloaded test account seeded through a new Liquibase changeset. See
`research.md` for the specific technology decisions and `data-model.md`/`contracts/` for the
resulting shapes.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`; Node.js LTS (22.x, pinned via `.nvmrc` and
root `package.json` `engines`).

**Primary Dependencies**: NestJS 10 (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`,
`@nestjs/swagger`, `@nestjs/config`, `@nestjs/terminus`); Kysely + `kysely-codegen`; `argon2`
(password hashing); `iovalkey` (Valkey client); `zod` (env validation); `class-validator` /
`class-transformer` (DTO validation).

**Storage**: PostgreSQL (existing `users` table, unchanged schema — accessed via Kysely) for
account data; Valkey for ephemeral API-key sessions (no new Postgres schema needed by this
feature).

**Testing**: Jest for unit tests (services/guard with repository, hasher, and session store
mocked); `supertest` + `testcontainers` (Postgres **and** Valkey containers) for e2e/contract
tests — real dependencies, no mocked DB or session store in integration tests, per
`packages/api/CLAUDE.md`.

**Target Platform**: Linux containers via Docker Compose (local dev/CI parity), same as the rest
of the repo.

**Project Type**: Backend web-service module within the `packages/api` monorepo package, plus the
first-time root monorepo scaffolding (`package.json` workspaces, shared `tsconfig.base.json`,
root ESLint/Prettier) that every subsequent package-level feature will build on.

**Performance Goals**: No dedicated throughput target for this feature; informal expectation is
that any single user operation completes well under 200ms locally against the Dockerized stack
(consistent with SC-001's 5-second end-to-end budget for create→login→first protected call,
which has a lot of headroom to spare).

**Constraints**: Passwords are never stored or returned in plaintext (FR-003); every issued API
key expires no later than 30 minutes after issuance and is enforced by the store's native TTL,
not application-side polling (FR-006); `packages/mcp` is untouched and never receives Valkey or
DB credentials (Constitution Principle III); the `users` table schema itself does not change
(only new seed data via a Liquibase changeset); the OpenAPI contract gains a deliberate
`security` requirement on the four protected `user` operations (Constitution Principle I; see
`research.md` §7).

**Scale/Scope**: Six HTTP operations (`createUser`, `loginUser`, `logoutUser`, `getUserByName`,
`updateUser`, `deleteUser`), one new Liquibase changeset (seed data only), one new Compose service
(`valkey`), the first-ever `api` Compose service, and the root/package scaffolding needed to run
any of it. `createUsersWithListInput` is explicitly out of scope (see `contracts/user-api.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against Constitution v1.0.0:

- **I. Contract-First Development** — PASS. Every endpoint, DTO field, and status code in
  `contracts/user-api.md` is derived from the existing `User` schema and `user`-tag paths in
  `packages/api/swagger/openapi_pet_store.json`. The one contract change this feature makes —
  attaching the existing but previously-unused `api_key` security scheme to four operations — is
  exactly the kind of deliberate, in-feature contract change the principle requires, not an
  ad hoc drift (`research.md` §7).
- **II. Liquibase Owns the Schema** — PASS. No DDL changes at all; the `users` table is untouched.
  The one new changeset (`0010-seed-test-user.sql`) is DML (an `INSERT`), still delivered as a
  formatted-SQL Liquibase changeset with a rollback, applied through the same `liquibase` Compose
  service on every `postgres` start, relying on Liquibase's own tracking table for idempotency —
  no manual "already seeded" guard introduced.
- **III. Package Boundaries Are HTTP, Not Imports** — PASS. This feature touches only
  `packages/api` and its own new `valkey` dependency. `packages/mcp` is not modified and does not
  gain Valkey or Postgres credentials.
- **IV. Typed, Explicit Data Access** — PASS. All `users` table access goes through a new
  `UserRepository` typed against the `kysely-codegen`-generated `Database` interface; no raw SQL
  outside that repository. The Valkey-backed session store is a separate, explicitly-named
  `ApiKeyStore`/session contract (`contracts/api-key-session.md`), not routed through Kysely or
  disguised as a second ORM — it's infrastructure for sessions, not a competing data-access layer
  for the `users` table.
- **V. Spec-Driven Delivery** — PASS. `spec.md` (002) precedes this plan; this plan precedes
  `/speckit-tasks`/`/speckit-implement`.

No violations; Complexity Tracking table remains empty.

*Post-Phase 1 re-check*: `research.md`, `data-model.md`, and `contracts/` introduced nothing that
changes any of the above — still PASS on all five principles. The one design choice worth
surfacing here explicitly: `ApiKeyGuard` re-checks account existence against Postgres on every
protected request (rather than adding a `userId`→tokens reverse index in Valkey to actively purge
sessions on account deletion). This keeps Principle IV's single source of typed truth for account
state in Postgres and avoids a second, easily-forgotten place that would need to stay in sync with
account deletion — not a violation, just the specific tradeoff `research.md` §6 documents.

## Project Structure

### Documentation (this feature)

```text
specs/002-user-api-key-auth/
├── plan.md                        # This file (/speckit-plan command output)
├── research.md                    # Phase 0 output (/speckit-plan command)
├── data-model.md                  # Phase 1 output (/speckit-plan command)
├── quickstart.md                  # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── user-api.md                # Phase 1 output — HTTP contract + the security amendment
│   └── api-key-session.md         # Phase 1 output — Valkey session store contract
└── tasks.md                       # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Root monorepo scaffolding (first application code in this repo)
package.json                       # npm workspaces root: "workspaces": ["packages/*"]
tsconfig.base.json                 # shared strict compiler options, extended by packages
.eslintrc.cjs                      # root ESLint config
.prettierrc                        # root Prettier config
.nvmrc                             # pinned Node LTS version

packages/api/
├── package.json
├── tsconfig.json                  # extends ../../tsconfig.base.json
├── nest-cli.json
├── Dockerfile
├── .env.example                   # adds VALKEY_URL, API_KEY_TTL_SECONDS alongside existing DATABASE_URL
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── env.validation.ts      # zod schema consumed by ConfigModule.forRoot({ validate })
│   ├── database/
│   │   ├── database.module.ts     # Kysely instance provider (pg Pool-backed)
│   │   └── types.ts               # kysely-codegen output — `Database` interface incl. `users`
│   ├── security/
│   │   ├── api-key.guard.ts       # ApiKeyGuard (CanActivate)
│   │   ├── api-key-store.service.ts  # issue/resolve/revoke against Valkey (contracts/api-key-session.md)
│   │   ├── password-hasher.service.ts # Argon2id hash/verify
│   │   └── valkey.module.ts       # iovalkey client provider
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.controller.ts     # createUser, loginUser, logoutUser, getUserByName, updateUser, deleteUser
│   │   ├── user.service.ts
│   │   ├── user.repository.ts     # Kysely queries against `users`
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       ├── update-user.dto.ts
│   │       ├── login-query.dto.ts
│   │       └── user-response.dto.ts   # excludes `password`
│   └── common/
│       └── filters/http-exception.filter.ts
└── test/
    ├── user.service.spec.ts
    ├── api-key.guard.spec.ts
    └── user.e2e-spec.ts            # supertest + testcontainers (Postgres + Valkey)

packages/api/migrations/
└── 0010-seed-test-user.sql         # new changeset: INSERT the preloaded test account (FR-013)

packages/api/swagger/
└── openapi_pet_store.json          # amended: `security: [{ "api_key": [] }]` on 4 operations

README.md                           # new: documents account creation, login, and API-key usage,
                                     # including the preloaded test account's credentials (FR-012/FR-013)

docker-compose.yml                  # amended: new `valkey` service; new `api` service
.env.example                        # amended at root: VALKEY_URL, API_KEY_TTL_SECONDS
```

**Structure Decision**: Everything lands inside `packages/api` plus the root scaffolding files
every future package-level feature will also depend on (`package.json` workspaces,
`tsconfig.base.json`, root lint/format config, `.nvmrc`) — matching the "Monorepo conventions" and
per-package structure both already specified in `CLAUDE.md`/`packages/api/CLAUDE.md`.
`packages/mcp` is not touched by this feature.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — table intentionally left empty.
