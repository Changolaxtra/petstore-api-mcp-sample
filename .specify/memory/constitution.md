<!--
Sync Impact Report
==================
Version change: TEMPLATE (unratified) → 1.0.0
Rationale for 1.0.0 (not 0.1.0/0.0.1): this is the project's first ratification of a previously
all-placeholder template — there is no prior ratified version to diff against, so it is treated
as an initial release rather than an "amendment" requiring MAJOR/MINOR/PATCH classification.

Modified principles: N/A (initial ratification). Five principles newly defined:
  - I.   Contract-First Development
  - II.  Liquibase Owns the Schema
  - III. Package Boundaries Are HTTP, Not Imports
  - IV.  Typed, Explicit Data Access
  - V.   Spec-Driven Delivery

Added sections: Core Principles (5), Additional Constraints, Development Workflow & Quality
Gates, Governance.
Removed sections: none (template placeholders only).

Templates requiring updates:
  - .specify/templates/plan-template.md   ✅ no change needed — its "Constitution Check" section
    already reads the active constitution dynamically rather than hardcoding principle content.
  - .specify/templates/spec-template.md   ✅ no change needed — no hardcoded constitution refs.
  - .specify/templates/tasks-template.md  ✅ no change needed — no hardcoded constitution refs.
  - specs/001-db-schema-migration/plan.md ⚠ pending at write time — its Constitution Check was
    written under "no gates defined yet"; re-evaluated against v1.0.0 as part of this amendment
    (see that file's Constitution Check section).

Follow-up TODOs: none outstanding.
-->

# Petstore API + MCP Sample Constitution

## Core Principles

### I. Contract-First Development

The OpenAPI contract at `packages/api/swagger/openapi_pet_store.json` is the single source of
truth for the HTTP surface. Database schemas, DTOs, generated types, and the MCP package's HTTP
client MUST be derived from, or validated against, this contract — never hand-maintained
independently of it. Any change to the contract MUST happen deliberately (via a Spec Kit
feature), never as a side effect of touching the API or MCP implementation.

**Rationale**: Two packages and a database schema all have to agree on the same shape. Letting
any one of them drift from the published contract reintroduces exactly the kind of silent
incompatibility a documented contract exists to prevent.

### II. Liquibase Owns the Schema

All database schema changes MUST be made through Liquibase changesets, written as formatted SQL,
committed under each service's own `migrations/` directory (e.g., `packages/api/migrations/`) —
never at the repository root or in a shared location. Liquibase MUST be applied automatically
every time the target database container starts, not only on first creation, relying on
Liquibase's own change-tracking table to make re-application a no-op rather than gating it behind
a manual "first run" check. No ORM or query layer MAY create, alter, or drop schema objects (no
`synchronize: true`, no ad hoc DDL from application code). Every changeset MUST carry an
explicit, working rollback.

**Rationale**: A single, deliberately-applied migration history is the only way to keep schema
state reproducible across every developer machine, CI run, and environment; auto-sync flags and
hand-run DDL both defeat that reproducibility.

### III. Package Boundaries Are HTTP, Not Imports

`packages/mcp` MUST reach `packages/api` only over HTTP, through a single shared HTTP client
whose request/response types are generated from the OpenAPI contract. It MUST NOT hold direct
database credentials, import `packages/api` internals, or implement business logic that belongs
in the API. Each package's own infrastructure (migrations, env files, config) lives inside that
package, not shared ad hoc across package boundaries.

**Rationale**: The MCP server exists to translate tool calls into API calls, not to become a
second implementation of the API's domain logic. Keeping the boundary at HTTP is what makes that
translation layer independently testable, deployable, and replaceable.

### IV. Typed, Explicit Data Access

TypeScript MUST run in `strict` mode in every package. Database access in `packages/api` MUST go
through Kysely, typed against a `Database` interface generated from the Liquibase-applied schema
(`kysely-codegen`) — never through raw, untyped SQL strings outside of a repository, and never
through a second, competing ORM introduced alongside it. All SQL lives behind one repository
class per aggregate; controllers and services never touch the Kysely instance directly.

**Rationale**: A typed query layer generated from the real schema catches drift between code and
database at compile time instead of in production. Mixing data-access tools multiplies the ways
that drift can silently slip through.

### V. Spec-Driven Delivery

Any feature beyond a trivial fix MUST go through the Spec Kit flow — specify → clarify (as
needed) → plan → tasks → implement — before implementation begins. Specs describe WHAT and WHY in
technology-agnostic terms; HOW belongs in the plan and tasks that follow. Every plan MUST
evaluate itself against this constitution's principles both before and after design (the
Constitution Check gate), and any violation MUST be justified in writing in that plan's
Complexity Tracking table or resolved by taking the simpler, compliant alternative instead.

**Rationale**: Skipping straight to code on anything non-trivial is how undocumented assumptions
— naming, folder locations, delete behavior, and so on — end up different in every corner of the
codebase. The spec/plan trail is what lets the next person, human or agent, reconstruct why a
decision was made.

## Additional Constraints

Technology choices below are binding, not advisory — they encode decisions already made for this
project and carried into its per-package `CLAUDE.md` files:

- **API**: NestJS (TypeScript, `strict` mode), organized into one module per OpenAPI tag
  (pet/store/user).
- **Database**: PostgreSQL, accessed exclusively via Kysely (Principle IV); schema owned
  exclusively by Liquibase (Principle II).
- **MCP**: LeanMCP (`@leanmcp/core`), decorator-based tools (`@Tool`/`@SchemaConstraint`), served
  over Streamable HTTP. Axios is the HTTP client to the API, with an explicit timeout and a
  bounded retry policy that never blindly retries non-idempotent writes.
- **Local/CI orchestration**: Docker Compose. The `liquibase` service MUST run every time the
  `postgres` service starts; `api` and `mcp` MUST declare `depends_on` conditions on their
  upstream being healthy/completed before they start.
- **Secrets**: supplied only via environment variables / `.env` files (gitignored) — never
  committed, never hardcoded into compose files.
- **Architecture documentation**: any feature that introduces or changes a non-trivial data model
  MUST ship (or update) a Mermaid entity-relationship diagram alongside the migration that created
  it, kept inside the owning package (e.g., `packages/api/architecture/`).

## Development Workflow & Quality Gates

- Conventional Commits for all commit messages.
- One lint/format configuration at the monorepo root, extended — not forked — by each package.
- Integration tests that touch the database MUST run against a real PostgreSQL instance (e.g. via
  `testcontainers`); the database MUST NOT be mocked in integration tests.
- Pull requests SHOULD stay scoped to one Spec Kit task (or a small, clearly related group) at a
  time.
- Every plan's Constitution Check gate MUST be re-evaluated — not rubber-stamped — whenever this
  constitution is amended.

## Governance

This constitution supersedes any conflicting guidance in `CLAUDE.md` files or ad hoc conventions.
Where a `CLAUDE.md` file documents a convention this constitution has not yet ratified as a
principle, that `CLAUDE.md` guidance remains advisory until folded in here.

Amendments are proposed and applied via `/speckit.constitution`. Version bumps follow semantic
versioning: **MAJOR** for a principle removed or redefined incompatibly with prior guidance,
**MINOR** for a principle or section added or materially expanded, **PATCH** for wording or
clarification changes with no normative effect.

Every `/speckit-plan` run MUST check its feature's plan against the current constitution's
principles and record any justified deviation in that plan's Complexity Tracking table.
Compliance drift discovered after the fact (via `/speckit-analyze`, code review, or otherwise)
MUST be resolved by either bringing the code into compliance or amending the constitution — never
by quietly ignoring the gate going forward.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
