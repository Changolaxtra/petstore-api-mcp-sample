# Contract: Bulk Account Registration

Source of truth: `packages/api/swagger/openapi_pet_store.json`, `user` tag,
`createUsersWithListInput`. No contract amendment — stays open, exactly as committed, consistent
with `createUser` in `specs/002-user-api-key-auth`.

| Operation (`operationId`) | Method & Path | Auth required | Notes |
|---|---|---|---|
| `createUsersWithListInput` | `POST /user/createWithList` | No | FR-015/FR-016. Request body is a JSON array of `User` objects (same shape as single `createUser`). Response is the array of created accounts (never including `password`), matching the per-account response shape from `specs/002-user-api-key-auth/contracts/user-api.md`. |

## All-or-nothing semantics (FR-016)

If any account in the submitted array would collide (case/whitespace-insensitively, per the
existing per-account rule) with an existing account **or with another entry in the same array**,
the entire request is rejected (`409`) and zero accounts from that batch are created — see
`research.md` §4 and `data-model.md`'s "Bulk account registration" section for how the single
wrapping transaction achieves this.

## Error shape

Same shared NestJS exception filter as every other module — no new error shape.
