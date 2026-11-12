# Implementation Plan: Petstore Database Schema Migration

**Branch**: `001-db-schema-migration` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-db-schema-migration/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver the first Liquibase migration for the Petstore API — a PostgreSQL schema covering Pet, Category, Tag, Order, and User exactly as defined in `packages/api/swagger/openapi_pet_store.json` — plus a hand-authored Mermaid entity-relationship diagram documenting it. The schema normalizes Pet's many-valued fields (tags, photo URLs) into child/association tables, enforces the contract's `status` enums and uniqueness rules at the DB layer, and blocks deletion of a Pet that still has Orders. No application code (NestJS modules, Kysely repositories) is touched in this feature — see `research.md` and `data-model.md` for the full set of schema decisions.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16 dialect) for the migration changesets; YAML for the Liquibase master changelog; Mermaid for the diagram. No TypeScript application code is added by this feature.

**Primary Dependencies**: Liquibase (`liquibase/liquibase` Docker image) as the migration runner; PostgreSQL 16 as the target database.

**Storage**: PostgreSQL — this feature *is* the storage layer being created.

**Testing**: Manual/scripted verification via `psql`/`\d+`/`information_schema` queries and Liquibase's own idempotent re-run behavior, per `quickstart.md`. No `testcontainers`-based automated test suite yet — that lands with the repository/service code in a later feature (per spec Assumptions), at which point it will run this same changelog against an ephemeral container.

**Target Platform**: Linux containers via Docker Compose (local dev and CI parity).

**Project Type**: Backend data-layer module within the `packages/api` monorepo package — not a standalone project.

**Performance Goals**: N/A for this feature — a one-time/idempotent migration of 7 tables has no meaningful throughput target; applying it is expected to complete in well under a second against an empty database.

**Constraints**: Must be idempotent (safe to re-run via Liquibase's own change-tracking, FR-009/SC-002); every changeset must carry an explicit rollback (per `packages/api/CLAUDE.md`); migration files must live inside `packages/api/migrations/`, not the repo root (FR-013).

**Scale/Scope**: 7 tables (`categories`, `tags`, `pets`, `pet_photo_urls`, `pet_tags`, `store_orders`, `users`), ~9 migration changesets, one ER diagram file. Single feature increment; no data volume/scale concerns at this stage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Re-evaluated against Constitution v1.0.0 (ratified 2026-11-11, after this plan was first written):

- **I. Contract-First Development** — PASS. Every table in `data-model.md`/`contracts/schema.md` is derived directly from `packages/api/swagger/openapi_pet_store.json`; no schema element was invented outside the contract.
- **II. Liquibase Owns the Schema** — PASS. All DDL lands in formatted-SQL Liquibase changesets under `packages/api/migrations/`; every changeset in the Project Structure plan carries an explicit rollback (per `research.md` §1 and `packages/api/CLAUDE.md`); the `liquibase` Compose service re-applies on every `postgres` start (root `CLAUDE.md`); no ORM `synchronize` flag is introduced.
- **III. Package Boundaries Are HTTP, Not Imports** — PASS (not applicable to this feature's scope — it touches only `packages/api`, no `packages/mcp` changes).
- **IV. Typed, Explicit Data Access** — PASS. `kysely-codegen` is explicitly scoped to run *after* Liquibase applies the schema (research.md §1, data-model.md); this feature deliberately stops before introducing repository code, so there is no raw-SQL-outside-a-repository risk yet.
- **V. Spec-Driven Delivery** — PASS. This plan follows specify → plan → (tasks next); no implementation has started ahead of the spec.

No violations; Complexity Tracking table remains empty.

*Post-Phase 1 re-check*: Phase 0/1 design (research.md, data-model.md, contracts/schema.md) introduced nothing inconsistent with the above — still PASS on all five principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-db-schema-migration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── schema.md        # Phase 1 output (/speckit-plan command) — the resulting DDL contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/api/
├── migrations/
│   ├── db.changelog-master.yaml        # Liquibase master changelog, includes changesets below in order
│   ├── 0001-create-categories-table.sql
│   ├── 0002-create-tags-table.sql
│   ├── 0003-create-pets-table.sql
│   ├── 0004-create-pet-photo-urls-table.sql
│   ├── 0005-create-pet-tags-table.sql
│   ├── 0006-create-store-orders-table.sql
│   ├── 0007-create-users-table.sql
│   ├── 0008-create-updated-at-trigger-function.sql
│   └── 0009-attach-updated-at-triggers.sql
├── architecture/
│   └── erd.md                          # Mermaid entity-relationship diagram (FR-010)
└── swagger/
    └── openapi_pet_store.json          # existing contract; read-only input to this feature, unchanged
```

**Structure Decision**: Everything this feature touches lives inside `packages/api/`, alongside the existing `swagger/` folder, per FR-013 and the package boundaries already established in `packages/api/CLAUDE.md`. No `src/` changes: this feature intentionally stops at the schema + diagram and does not introduce NestJS modules, Kysely repositories, or generated types (those are explicitly out of scope per the spec's Assumptions and will be a follow-on feature that consumes this schema via `kysely-codegen`).

## Complexity Tracking

*No constitution violations to justify — table is intentionally empty.*
