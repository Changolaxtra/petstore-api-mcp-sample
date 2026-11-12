# Contract: User HTTP Operations

Source of truth: `packages/api/swagger/openapi_pet_store.json`, `user` tag. This feature adds a
`security` requirement to four of the six existing operations (see "Contract amendment" below) —
it does not add, remove, or reshape any operation or the `User` schema itself.

| Operation (`operationId`)   | Method & Path          | Auth required | Notes |
|------------------------------|-------------------------|----------------|-------|
| `createUser`                 | `POST /user`            | No             | FR-001/FR-002/FR-003. Request/response body: `User` schema. Rejects a username collision (case/whitespace-insensitive per Edge Cases) with `400`. |
| `loginUser`                  | `GET /user/login`       | No             | FR-004/FR-005. Query params `username`, `password`. Success (`200`): response body is the issued API key as a bare JSON string, per the existing contract's `schema: { type: string }` — not wrapped in an object. Failure: `400`. |
| `logoutUser`                 | `GET /user/logout`      | **Yes**        | FR-008. Revokes the session identified by the caller's own `api_key` header. Always `200` for a caller who presented a key the guard accepted (there is nothing else to report). |
| `getUserByName`              | `GET /user/{username}`  | **Yes**        | FR-009. `404` if no such account. Response never includes `password`. |
| `updateUser`                 | `PUT /user/{username}`  | **Yes**        | FR-010. `404` if no such account; `400` on a malformed body. Does not change `username` itself (path is the identity; see Assumptions in spec re: no rename semantics defined). |
| `deleteUser`                 | `DELETE /user/{username}` | **Yes**      | FR-011. `404` if no such account. After this returns, the guard's per-request existence check (see `data-model.md`) means any of that account's other outstanding API keys stop working on their very next use. |

`createUsersWithListInput` (`POST /user/createWithList`) exists in the contract but is **out of
scope** for this feature — the spec's functional requirements cover only single-account
create/read/update/delete plus auth. It is left for a follow-up feature if batch creation is
needed.

## Contract amendment (this feature)

`packages/api/swagger/openapi_pet_store.json` already declares an `api_key` security scheme
(`type: apiKey`, `in: header`, `name: api_key`) but applies it to no operation. This feature adds:

```json
"security": [{ "api_key": [] }]
```

to the `logoutUser`, `getUserByName`, `updateUser`, and `deleteUser` operation objects only.
`createUser` and `loginUser` keep no `security` entry (open). This is a deliberate, in-scope
contract change per Constitution Principle I — see `research.md` §7.

## Error shape

Failures use whatever error shape the OpenAPI `default`/`4xx` responses already describe for the
`user` tag, surfaced through the project's shared NestJS exception filter — this feature does not
introduce a new error shape (per `packages/api/CLAUDE.md`: "don't invent new error shapes per
module").
