# Data Model: User Account Operations & API Key Authentication

## User Account (`users` table — persisted, PostgreSQL via Kysely)

Already created by `packages/api/migrations/0007-create-users-table.sql` (feature
`001-db-schema-migration`); this feature adds no schema change to it. Column names are the
Liquibase-applied `snake_case`; the Kysely `Database["users"]` interface (via `kysely-codegen`,
run after migrations) exposes them as-is, and the repository maps to/from the OpenAPI `User`
shape (`camelCase`) at the boundary.

| Column        | Type        | Nullable | Notes                                                                 |
|---------------|-------------|----------|------------------------------------------------------------------------|
| `id`          | `bigint`    | no       | Identity PK; maps to OpenAPI `User.id`.                                |
| `username`    | `text`      | no       | `UNIQUE`; case-sensitive at the DB level (FR-001/FR-002 — collision handling for near-duplicates is enforced in the service layer, see Validation Rules). |
| `first_name`  | `text`      | yes      | Maps to `User.firstName`.                                              |
| `last_name`   | `text`      | yes      | Maps to `User.lastName`.                                               |
| `email`       | `text`      | yes      | Maps to `User.email`.                                                  |
| `password`    | `text`      | yes      | **Never** the plaintext password — holds the Argon2id hash string only (FR-003). Column name is unchanged from the existing migration; only what's written to it changes. |
| `phone`       | `text`      | yes      | Maps to `User.phone`.                                                  |
| `user_status` | `integer`   | yes      | Maps to `User.userStatus`.                                              |
| `created_at`  | `timestamptz` | no     | Set by DB default; not client-settable.                                |
| `updated_at`  | `timestamptz` | no     | Maintained by the existing `updated_at` trigger (changeset `0009`).     |

**Validation rules** (enforced in the service layer, ahead of/alongside DB constraints):

- `username`: required on create; compared case-insensitively and with leading/trailing
  whitespace trimmed before the uniqueness check, so `"Alice"`, `"alice"`, and `" alice "` are
  treated as the same account (spec Edge Cases).
- `password`: required on create; hashed with Argon2id before it ever reaches the repository —
  the repository and everything below it only ever sees the hash.
- `email`, `phone`, `firstName`, `lastName`, `userStatus`: optional, pass through unchanged.
- Response DTOs never include `password` (hash or otherwise) — the field is write-only from the
  API's perspective.

**Relationships**: none — consistent with `packages/api/architecture/erd.md`'s existing note that
`users` has no foreign-key relationship to any other table.

## API Key Session (Valkey — ephemeral, not a database table)

Not a persisted entity; modeled here because it's the other piece of state this feature
introduces.

| Field              | Shape                              | Notes                                                              |
|---------------------|-------------------------------------|---------------------------------------------------------------------|
| Key                 | `apikey:<token>` (string)          | `<token>` is a 32-byte random value, base64url-encoded.              |
| Value               | JSON `{ "userId": number }`        | The only data needed to resolve "whose session is this".            |
| TTL                 | `API_KEY_TTL_SECONDS` (default `1800`) | Native Valkey expiry, set at issuance (`SET ... EX ...`); FR-006.|

**State transitions**:

```
   loginUser (success)
         │
         ▼
      ACTIVE  ──── logoutUser ────────────▶  GONE (explicit DEL)
         │
         └──── TTL elapses (no activity) ──▶  GONE (Valkey auto-expiry)
```

There is no "renew" transition — per spec Assumptions, the TTL is a fixed lifetime from issuance,
not reset by activity. A user who wants a fresh 30-minute window signs in again, which creates a
new, independent session (existing sessions for that account are left alone).

**Relationship to User Account**: many-to-one, informally — a `userId` in a session value refers
to a `users.id` row, but this is enforced at the application layer, not by a database foreign
key, since the session never lives in PostgreSQL. `ApiKeyGuard` resolves the token to a `userId`
in Valkey and then loads that user from PostgreSQL on every request (it needs the row anyway, to
attach a meaningful `request.user`); if the account no longer exists, the guard rejects the
request exactly as it would an invalid key. This is what makes FR-011 ("a deleted account's keys
stop granting access") hold immediately, without needing a second, userId→tokens index in Valkey
just to hunt down and delete that user's other sessions.
