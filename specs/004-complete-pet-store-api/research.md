# Research: Complete the Pet Store API (Pets, Orders, Bulk Accounts)

## 1. Extending the hand-authored `Database` interface

- **Decision**: Extend `packages/api/src/database/types.ts` with `CategoriesTable`,
  `TagsTable`, `PetsTable`, `PetPhotoUrlsTable`, `PetTagsTable`, and `StoreOrdersTable`,
  matching migrations `0001`–`0006` column-for-column.
- **Rationale**: That file is already a documented stand-in for the real `kysely-codegen`
  output, scoped so far to only what `specs/002-user-api-key-auth` needed (`users`). This
  feature is the first to touch the other five tables that `specs/001-db-schema-migration`
  already created — no new migration is needed, just typing what already exists in the schema.
- **Alternatives considered**: Running `kysely-codegen` for real now — reasonable, but a
  larger, separable change (it would also regenerate `users`) better done as its own
  tooling change; out of scope for this feature.

## 2. Breaking a DI cycle: promoting security providers to a global module

- **Decision**: Extract `PasswordHasherService`, `ApiKeyStoreService`, `ApiKeyGuard`, and
  `UserRepository` out of `UserModule`'s own `providers` array into a new `@Global()`
  `SecurityModule` (`packages/api/src/security/security.module.ts`), imported once from
  `AppModule` alongside `DatabaseModule`/`ValkeyModule`. `UserModule` keeps only
  `UserService`/`UserController`.
- **Rationale**: `PetModule` and `StoreModule` both need `ApiKeyGuard` (see decision 3).
  `ApiKeyGuard` depends on `UserRepository` (to confirm a resolved `userId` still has an
  account — `specs/002-user-api-key-auth/research.md` §6), which currently lives inside
  `UserModule`. Importing `UserModule` from `PetModule`/`StoreModule` would work for the guard,
  but `UserModule` itself also needs `ApiKeyStoreService` (for login/logout) — so a second
  module trying to get the guard *from* `UserModule` while `UserModule` also depends on
  security services sets up exactly the kind of module cycle Nest requires `forwardRef()`
  gymnastics to work around. Making the security providers `@Global()` (the same pattern
  already used for `DatabaseModule`/`ValkeyModule`) avoids the cycle entirely — every module
  that needs `ApiKeyGuard` just uses it, no explicit import required.
- **Alternatives considered**: `forwardRef()` between `UserModule` and a new `SecurityModule`
  — rejected; it works but is exactly the kind of circular-dependency smell worth designing
  away from when a clean alternative (promote to global, matching an existing pattern) exists.
  Duplicating a raw "does this user exist" query directly in the guard instead of depending on
  `UserRepository` — rejected; it would bypass the repository layer Constitution Principle IV
  requires all SQL to live behind.

## 3. Correcting spec.md's security assumption; extending `api_key` across the `pet` tag

- **Decision**: `spec.md`'s Assumptions claimed this feature "does not introduce new access
  restrictions" on pet/order operations. That was written before inspecting the contract in
  detail and turns out to be wrong for pets specifically — **correcting it here**: every
  operation tagged `pet` in the committed contract already declares a security requirement
  (`petstore_auth`, an OAuth2 implicit flow whose `authorizationUrl` points at the public
  reference demo's own server, not anything this project controls), and two operations
  (`getPetById`, `getInventory`) already also accept this project's own `api_key` scheme as an
  alternative. Implementing real OAuth2 against an external, uncontrolled authorization server
  is out of scope and was not requested. Instead, this feature extends the pattern the contract
  itself already establishes on `getPetById`: it adds `{"api_key": []}` as an additional
  OR-alternative security option (alongside the existing `petstore_auth` entry — not replacing
  it) to `addPet`, `updatePet`, `updatePetWithForm`, `deletePet`, `uploadFile`,
  `findPetsByStatus`, and `findPetsByTags`. Every `pet`-tag operation ends up requiring the
  `api_key` header in this implementation, satisfying one of its documented alternatives.
  `deletePet`'s separate, unused `api_key` header *parameter* (distinct from a `security`
  requirement, and never actually enforced by the original reference contract) is removed as
  redundant now that a proper `security` entry covers the same header.
- **Rationale**: Leaving these operations completely unauthenticated would ignore intent the
  contract already expresses; implementing OAuth2 against a third party's server would be
  theater, not a working feature. Reusing the exact alternative-security pattern the contract's
  own author already used on `getPetById` is the smallest change consistent with both the
  contract's intent and this project's actual, working auth mechanism.
- **Store and bulk-user operations are unaffected**: `placeOrder`, `getOrderById`, and
  `deleteOrder` declare no security requirement at all in the contract, and nothing in this
  feature's request calls for adding one — they stay open, exactly as committed.
  `createUsersWithListInput` likewise stays open, consistent with `createUser` in
  `specs/002-user-api-key-auth`. `getInventory` already required `api_key`; it's simply
  implemented now.
- **Alternatives considered**: Leaving all pet operations open, deferring to spec.md's original
  (incorrect) assumption — rejected once the contract's actual content was inspected; see above.
  Implementing OAuth2 for real — rejected as a large, pointless scope expansion pointing at a
  server this project doesn't own.

## 4. Transactions on every repository write

- **Decision**: Every repository write method — new (`PetRepository.create/update/delete`,
  `OrderRepository.create/delete`, `UserRepository.createMany`) and pre-existing
  (`UserRepository.create/updateByUsername/deleteByUsername`) — runs its SQL inside
  `db.transaction().execute(async (trx) => { ... })`, using `trx` instead of `db` for every
  statement in that method, even where a method is a single `INSERT`/`UPDATE`/`DELETE` today.
- **Rationale**: The user's own request explicitly calls for transactions on "new and existing"
  DB-writing operations (FR-017/SC-003) — not just the genuinely multi-statement ones. Wrapping
  every write uniformly is simpler to reason about and verify than special-casing which methods
  "need" it, and costs nothing meaningful for a single-statement case (Postgres treats a lone
  statement in an explicit transaction the same as an implicit one).
- **Alternatives considered**: Only wrapping genuinely multi-statement methods (pet
  create/update, bulk user creation) — rejected; doesn't satisfy the explicit "existing"
  operations half of the request (plain `updateUser`/`deleteUser` etc. would stay unwrapped).

## 5. Resolving pet categories and tags by name

- **Decision**: A pet's category and tags are submitted (and returned) by name, not by a
  client-supplied id. Inside the pet-write transaction, each name is resolved to an id via
  `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id` (and the equivalent for `tags`) — a single statement that creates the row if
  it's new or returns the existing id if it isn't, relying on the `UNIQUE` constraint already on
  both `categories.name` and `tags.name`.
- **Rationale**: Matches spec.md's Assumption that a tag not already in the system is
  recognized by name and attached as part of the same write, without a separate
  "register this tag first" step. The upsert-returning-id statement does this in one round
  trip, inside the same transaction as the rest of the pet write — no separate
  check-then-insert race condition.
- **Alternatives considered**: `SELECT` first, `INSERT` only if missing (two statements,
  race-prone outside a transaction, and still two round trips even inside one) — rejected in
  favor of the single upsert statement.

## 6. Parsing `findPetsByStatus` / `findPetsByTags`'s multi-value query parameters

- **Decision**: Both operations' query parameters (`status`, `tags`) are parsed as a single,
  comma-delimited string value (`?status=available,pending`), split on `,` in the controller/DTO
  layer.
- **Rationale**: The OpenAPI parameter definitions mark `explode: true` (which usually implies
  repeated params, `?status=a&status=b`), but each operation's own `description` field explicitly
  states "Multiple status/tag values can be provided with comma separated strings" — the
  documented, testable contract behavior inherited from the public reference spec. This plan
  follows what the contract says in plain language over the techically-mismatched `explode`
  flag, since that's what `quickstart.md`'s examples (and any real client reading the docs) will
  actually send.
- **Alternatives considered**: Honoring `explode: true` literally (repeated query params) —
  rejected; contradicts the operations' own documented behavior and this project's committed
  contract text.

## 7. Receiving the uploaded image's raw bytes

- **Decision**: `POST /pet/{petId}/uploadImage`'s request body is `application/octet-stream` —
  a raw binary body, not a multipart form — so Nest's default JSON/urlencoded body parser
  doesn't apply and Multer (designed for `multipart/form-data`) isn't the right tool either.
  `main.ts` registers a route-scoped `express.raw({ type: 'application/octet-stream' })`
  middleware for exactly that path, ahead of Nest's own routing, so the controller receives the
  uploaded bytes as a plain `Buffer` on `req.body`.
- **Rationale**: This is the standard, documented way to accept a raw-binary request body in a
  NestJS app built on Express, without introducing a new dependency.
- **Alternatives considered**: Treating it as `multipart/form-data` with `FileInterceptor` —
  rejected; doesn't match what the committed contract actually declares for this operation's
  `requestBody` content type.

## 8. Storing and serving the uploaded image

- **Decision**: Uploaded bytes are written to a local `packages/api/uploads/<petId>/` directory
  under a generated filename, served back via `NestExpressApplication#useStaticAssets()`
  (built into the already-installed `@nestjs/platform-express` — no new dependency) mounted at
  `/uploads`. The resulting URL becomes a new row in `pet_photo_urls`. `docker-compose.yml`
  gains a named volume for this directory, mirroring the existing `postgres_data` volume, so
  uploads survive container restarts.
- **Rationale**: FR-008 requires an uploaded image to actually "appear among that pet's photos"
  — a fetchable URL, not just metadata about an upload that happened. Local disk is the
  simplest storage that satisfies this without adding an external dependency (e.g. S3) this
  sample project has no other use for.
- **Alternatives considered**: Recording upload metadata without persisting the bytes anywhere
  — rejected; wouldn't make the resulting "photo" actually viewable, failing FR-008's own
  acceptance scenario. An object-storage service — rejected as unnecessary infrastructure for a
  sample project's image uploads.

All Technical Context items are resolved above; no `NEEDS CLARIFICATION` markers remain.
