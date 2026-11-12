# packages/api — NestJS Petstore API

TypeScript/NestJS implementation of the Swagger Petstore contract defined in `swagger/openapi_pet_store.json`. That file is the frozen source of truth for the HTTP contract — implement against it, don't drift from it ad hoc. If the contract needs to change, edit the OpenAPI file first (ideally via a Spec Kit feature) and regenerate types from it.

## Stack
- TypeScript (`strict: true`), NestJS, modular monolith
- PostgreSQL
- **Kysely** as the DB access layer — a type-safe SQL query builder, not a full ORM. Chosen as the closest TypeScript equivalent to jOOQ: fluent, SQL-shaped query building, with types generated from the real schema rather than hand-maintained entity classes. (If the team later wants schema-as-code migrations and a friendlier query API, Drizzle ORM is the next-best fluent alternative — don't mix the two in the same codebase.)
- **Liquibase** owns schema migrations — deliberately kept separate from Kysely. Kysely (and `kysely-codegen`) only ever reads the schema that Liquibase already applied; it has no migration runner of its own in this project. This also keeps schema change history in a tool-agnostic format if the DB is ever shared with non-Node services.
- `@nestjs/swagger` to serve interactive docs, kept consistent with the committed OpenAPI file
- `class-validator` / `class-transformer` for DTO validation
- `@nestjs/config` plus a validated config schema (zod or Joi) for env vars
- Jest for unit tests, `supertest` for e2e/controller tests, `testcontainers` for real-Postgres integration tests — don't mock the DB in integration tests

## Structure (mirrors the OpenAPI tags: pet, store, user)
```
src/
  pet/        PetModule — controller, service, repository (Kysely queries), DTOs
  store/      StoreModule — order + inventory endpoints
  user/       UserModule
  database/   Kysely instance/provider, generated DB types
  common/     shared pipes, filters, interceptors, guards
migrations/
  db.changelog-master.yaml   <- Liquibase master changelog, includes the files below in order
  0001-create-pet-table.sql
  0002-create-store-order-table.sql
  0003-create-user-table.sql
  ...
swagger/
  openapi_pet_store.json   <- contract; keep in sync, don't hand-edit without a deliberate change
```
One module per OpenAPI tag. Controllers stay thin (routing + DTO mapping only); business logic lives in services; all SQL lives behind repositories built on Kysely — controllers and services never import the Kysely instance directly.

## Schema migrations (Liquibase)
- Liquibase is the only thing allowed to change the schema — no `synchronize`/auto-migrate flags anywhere, and Kysely never creates or alters tables.
- One changeset per file, numbered and named for what it does (`0004-add-pet-category-index.sql`), included from `db.changelog-master.yaml` in the order they must run. Never edit a changeset that has already shipped — add a new one.
- Use Liquibase's [formatted SQL changelogs](https://docs.liquibase.com/concepts/changelogs/sql-format.html) (plain `.sql` files with `--liquibase formatted sql` + `--changeset` header comments) rather than XML — plain SQL is what the team actually reads and writes day to day; reserve Liquibase's native YAML/XML features (preconditions, rollback blocks) for cases formatted SQL can't express.
- Give every changeset an explicit `rollback` block (or a `--rollback` comment in the SQL) — "no rollback defined" is not acceptable for anything touching production data.
- The migrations folder (`packages/api/migrations/`) lives inside the API package itself, alongside `src/` and `swagger/` — never at the repo root or in a shared/top-level location, since the schema it describes belongs to this package.
- Run via the `liquibase/liquibase` Docker image (or the CLI locally) pointed at `migrations/db.changelog-master.yaml` and the same `DATABASE_URL`-derived connection the API uses — don't hand-roll a Node migration runner.
- In Docker Compose, the `liquibase` service applies the changelog **every** time the `postgres` container starts, not just on first creation — see the root `CLAUDE.md`. This relies on Liquibase's own `DATABASECHANGELOG` tracking table to make reruns a no-op; never add a manual "already migrated" guard around it.
- `kysely-codegen` runs **after** Liquibase has applied the changelog, never before — it introspects whatever schema Liquibase just produced. Treat the generated `Database` interface as a build artifact of the migration step, not something maintained independently.

## Database layer (Kysely)
- One repository class per aggregate (`PetRepository`, `OrderRepository`, `UserRepository`), each typed against the generated `Database` interface — no raw string SQL outside of repositories.
- Wrap multi-statement writes in explicit Kysely transactions (`db.transaction().execute(...)`); never rely on implicit autocommit for anything touching more than one table.

## API conventions
- Global `ValidationPipe({ whitelist: true, transform: true })` — reject unknown fields, never trust unvalidated bodies.
- Global exception filter mapping errors to the Petstore error shape already defined in the OpenAPI spec — don't invent new error shapes per module.
- Pagination/filtering on list endpoints (`findByStatus`, `findByTags`) should stay consistent with how the spec models query params — don't add undocumented params.
- Response DTOs are separate classes from DB row types; never leak Kysely row shapes straight out of a controller.

## Testing
- Unit test services with the repository mocked.
- e2e/contract tests boot the real Nest app plus a `testcontainers` Postgres instance and assert against the committed OpenAPI shapes.
- Run the Liquibase changelog against the test container before each test suite (same changelog as dev/prod) — never run tests against a shared/dev database, and never apply schema via anything other than Liquibase.

## Local dev
- `npm run start:dev` for watch mode.
- `npm run db:migrate` applies `migrations/db.changelog-master.yaml` via Liquibase against `DATABASE_URL`; run it (and `kysely-codegen`) after pulling in new changesets and before starting the app.
- Expects `DATABASE_URL` (and friends) from `.env` — see `.env.example`. In Docker Compose, the `api` service gets these from the `postgres` service, not hardcoded.
- Expose a health endpoint (`@nestjs/terminus`) that checks DB connectivity — Compose's `depends_on.condition: service_healthy` for `postgres`, and the `mcp` service's dependency on `api`, both rely on it.
