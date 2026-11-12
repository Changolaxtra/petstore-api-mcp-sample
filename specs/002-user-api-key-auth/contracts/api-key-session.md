# Contract: API Key Session Store (Valkey)

This is an internal contract between `UserService`/`ApiKeyGuard` and the Valkey instance — not an
HTTP-facing contract, and not consumed by `packages/mcp` (which never gets Valkey or DB
credentials, per Constitution Principle III).

## Key / value shape

| Aspect | Value |
|--------|-------|
| Key pattern | `apikey:<token>` |
| `<token>` | `crypto.randomBytes(32).toString('base64url')` — 43 URL-safe characters, generated fresh per login |
| Value | JSON string: `{"userId": <number>}` |
| TTL | `API_KEY_TTL_SECONDS` env var, default `1800` (30 minutes); set via `SET key value EX <ttl>` at issuance |

## Operations

| Operation | When | Behavior |
|-----------|------|----------|
| `issue(userId)` → `token` | `loginUser` success | Generates a token, `SET`s `apikey:<token>` with the TTL, returns the token to the caller as the response body. |
| `resolve(token)` → `userId \| null` | Every request hitting `ApiKeyGuard` on a protected route | `GET apikey:<token>`; `null` (→ `401`) if the key is absent (never issued, already revoked, or expired). Does **not** refresh the TTL — a resolve is not an activity-based renewal (spec Assumption: fixed lifetime from issuance). |
| `revoke(token)` | `logoutUser` | `DEL apikey:<token>`. Idempotent — revoking an already-gone key is not an error. |

## Expiry guarantee

Enforcement is entirely Valkey's native key expiry — there is no polling, sweeper, or
application-level "is this expired" check anywhere in this contract. This is what lets
`resolve()` be a single round trip and keeps expiry correct by construction (SC-003).

## Interaction with account deletion

This store has no knowledge of account deletion. `ApiKeyGuard` is responsible for treating "the
resolved `userId` has no matching account" the same as "key not found" (see `data-model.md`) —
this contract does not need a `revokeAllForUser(userId)` operation as a result.
