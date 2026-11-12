# Research: User Account Operations & API Key Authentication

Each unknown from the plan's Technical Context is resolved below. This is the first feature to
land application code (`packages/api` has, until now, only `migrations/`, `swagger/`, and its
`CLAUDE.md`), so several decisions here are really "pick the first stack convention" calls rather
than feature-specific tradeoffs — they follow directly from `packages/api/CLAUDE.md` and the root
`CLAUDE.md` wherever those already prescribe an answer.

## 1. Monorepo / package scaffolding baseline

- **Decision**: npm workspaces at the repo root (`package.json` with `workspaces: ["packages/*"]`),
  a shared `tsconfig.base.json` with `strict: true`, one root ESLint + Prettier config extended by
  `packages/api/tsconfig.json`, and Node LTS pinned via `.nvmrc` + `engines`.
- **Rationale**: Exactly what the root `CLAUDE.md` "Monorepo conventions" section already
  mandates; nothing feature-specific to decide here — just the first feature to actually create
  these files.
- **Alternatives considered**: pnpm/Turborepo — explicitly deferred by root `CLAUDE.md` until
  build-caching becomes a real bottleneck; not justified for a two-package repo.

## 2. Password hashing algorithm

- **Decision**: Argon2id via the `argon2` npm package (native bindings), using that library's
  current recommended defaults (memory/time/parallelism cost factors left at the library default
  rather than hand-tuned).
- **Rationale**: Argon2id is OWASP's current first recommendation for password storage —
  memory-hard (resists GPU/ASIC cracking better than bcrypt) and immune to bcrypt's 72-byte input
  truncation footgun. The project already runs everything through Docker, so native-binding
  compilation is a non-issue.
- **Alternatives considered**: `bcrypt` — mature and simple, but capped at 72 input bytes and
  comparatively easier to accelerate on dedicated hardware; kept as a documented fallback only if
  `argon2`'s native build ever becomes a problem in CI. Built-in `crypto.scrypt` — viable but
  pushes salt/parameter management onto application code instead of a vetted library API.

## 3. API key shape and issuance

- **Decision**: An opaque, cryptographically random token — `crypto.randomBytes(32).toString('base64url')`
  — generated fresh on every successful login. Nothing about the user is encoded in the token
  itself; it is only ever a lookup key into the session store (see §5).
- **Rationale**: The feature's only requirement is "present this to prove who you are, and it
  stops working after 30 minutes or on logout" (spec FR-004/FR-006/FR-008) — a stateful, random
  token backed by a store with native expiry satisfies that directly, with trivial, atomic
  revocation (just delete the key).
- **Alternatives considered**: JWT — would need signing-key management and, because the spec
  still requires server-side early revocation on logout (FR-008), a JWT would need its own
  server-side denylist anyway, which is extra machinery for no benefit when the store-backed
  opaque token already gives revocation for free.

## 4. Valkey client library

- **Decision**: `iovalkey` — the Valkey project's own maintained fork of `ioredis`, same
  well-known API, pointed at `VALKEY_URL`.
- **Rationale**: The feature description specifically calls for Valkey as the session store; using
  the client maintained *for* Valkey (rather than a generic Redis-protocol client used
  incidentally) keeps the dependency aligned with that explicit choice and its future protocol
  evolution.
- **Alternatives considered**: `ioredis` — works today since Valkey speaks the Redis protocol, but
  ties the dependency name to a different project by convention. `redis` (node-redis v4) — equally
  workable, no concrete advantage over `iovalkey` for this use case.

## 5. API key storage shape and TTL enforcement

- **Decision**: One Valkey string key per session, `apikey:<token>` → JSON `{"userId": <id>}`, set
  with a native expiry (`SET key value EX <API_KEY_TTL_SECONDS>`, default `1800`). Logout issues a
  `DEL` on that same key. No separate "issued at" or "expires at" field is stored — Valkey's own
  TTL clock is the single source of truth for expiry.
- **Rationale**: Letting the store enforce TTL natively means there is no application-level
  expiry check to get out of sync with reality, and no sweeper/cron job needed to clean up stale
  keys — Valkey reclaims them itself. This directly satisfies FR-006/SC-003.
- **Alternatives considered**: Storing `issuedAt`/`expiresAt` timestamps in the value and checking
  them in application code on every request — strictly more code for a weaker guarantee (a
  forgotten check path could accept an "expired-on-paper" key); rejected.

## 6. Request authentication (guard) design

- **Decision**: A single `ApiKeyGuard` (NestJS `CanActivate`) applied to the protected `user`
  endpoints. It reads the `api_key` request header (matching the header name already declared by
  the `api_key` security scheme in `packages/api/swagger/openapi_pet_store.json`), resolves it
  against the Valkey-backed session store to a `userId`, then loads that user via
  `UserRepository` and attaches it to the request — or throws `401 Unauthorized` if the key is
  missing/unknown/expired *or* the resolved `userId` no longer has a matching account (covers
  FR-011 without a second Valkey index). `createUser` and `loginUser` are intentionally outside
  the guard (spec Assumptions: account creation and sign-in must be reachable without a key
  already in hand).
- **Rationale**: Reuses the scheme the contract already declares instead of inventing a new header
  name; keeps the "what is open vs. protected" decision in exactly one place (the guard's
  `@UseGuards` placement on the controller), matching spec FR-007. The extra DB lookup is work the
  guard needs to do anyway to produce a usable `request.user`, so checking account existence there
  is free.
- **Alternatives considered**: A global guard with a per-route `@Public()` escape hatch — more
  moving parts for only two open routes; the simpler per-route opt-in on the protected routes was
  preferred for a module this size. A secondary `user-sessions:<userId>` index in Valkey to
  actively revoke every session on account deletion — rejected as unnecessary bookkeeping once the
  guard already re-checks the account on every request.

## 7. Contract amendment for security enforcement

- **Decision**: `packages/api/swagger/openapi_pet_store.json` already defines an `api_key`
  `securityScheme` but applies it to no operation. This feature adds
  `"security": [{"api_key": []}]` to `logoutUser`, `getUserByName`, `updateUser`, and `deleteUser`
  (not to `createUser`/`loginUser`), as a deliberate contract change landing with this feature.
- **Rationale**: Constitution Principle I requires the OpenAPI contract to be the single source of
  truth for the HTTP surface and any change to it to happen deliberately via a Spec Kit feature —
  implementing enforcement the contract doesn't describe would itself be a drift in the other
  direction. This feature is exactly the deliberate change the principle calls for.
- **Alternatives considered**: Leaving the contract as-is and only enforcing the guard in code —
  rejected; it would let the committed contract and the real HTTP behavior silently disagree about
  which endpoints need a key.

## 8. Seeding the preloaded test account

- **Decision**: A new Liquibase changeset, `packages/api/migrations/0010-seed-test-user.sql`,
  `INSERT`s the one preloaded test user with a pre-computed Argon2id hash of a fixed, documented
  password. It runs through the same `liquibase` Compose service as every other changeset, on
  every `postgres` startup, relying on Liquibase's own `DATABASECHANGELOG` tracking to make reruns
  a no-op — no separate seed script or runner.
- **Rationale**: Keeps a single, already-idempotent mechanism (Liquibase) responsible for
  everything that needs to exist in the database before the API starts, rather than introducing a
  second, bespoke seeding path. Matches spec FR-013.
- **Alternatives considered**: A Node seed script run on API boot — rejected; it would duplicate
  the idempotency guarantees Liquibase already provides and adds a second "did this already run"
  mechanism to reason about.

## 9. Config validation

- **Decision**: `@nestjs/config` with a `zod` schema validating `DATABASE_URL`, `VALKEY_URL`,
  `API_KEY_TTL_SECONDS` (default `1800`), and `PORT` at boot; the app fails fast on an invalid/
  missing value instead of starting in a half-configured state.
- **Rationale**: Directly what `packages/api/CLAUDE.md` already prescribes ("`@nestjs/config` plus
  a validated config schema (zod or Joi)"); zod chosen over Joi for being TypeScript-first and
  already a near-certain fit for inferring the resulting config type.
- **Alternatives considered**: Joi — equally valid per the same CLAUDE.md line; zod preferred only
  for its TS-native type inference, not a hard requirement.

## 10. Testing approach for the new security/session layer

- **Decision**: Unit tests for `UserService`/`ApiKeyGuard` mock the repository, password hasher,
  and session store. e2e/contract tests boot the real Nest app against `testcontainers`-managed
  Postgres **and** Valkey instances, exercising create → login → protected call → logout, plus an
  expiry case using a short `API_KEY_TTL_SECONDS` override (e.g. `2`) injected via test config —
  never the real 30-minute wait.
- **Rationale**: Matches `packages/api/CLAUDE.md`'s existing testing conventions ("don't mock the
  DB in integration tests") extended to the new Valkey dependency; the short-TTL override keeps
  the expiry acceptance scenario (spec SC-003) fast and deterministic in CI.
- **Alternatives considered**: Mocking Valkey in e2e tests — rejected for the same reason the DB
  isn't mocked: a mocked TTL store could pass while the real expiry semantics are broken.

All items from the plan's Technical Context are resolved above; no `NEEDS CLARIFICATION` markers
remain.
