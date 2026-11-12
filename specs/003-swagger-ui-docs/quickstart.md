# Quickstart: Validating the Swagger UI Documentation

Prerequisites: the stack running via `docker compose up --build` (see root `README.md`), or
`npm run start:dev --workspace packages/api` against a locally reachable Postgres/Valkey.

## 1. Open the documentation page

Visit `http://localhost:3000/docs` in a browser. Expect every `pet`, `store`, and `user`
operation from `packages/api/swagger/openapi_pet_store.json` listed, grouped by tag, each showing
its method, path, parameters, and response shapes (FR-001, FR-002). Operations with a lock icon
(`logoutUser`, `getUserByName`, `updateUser`, `deleteUser`) are the ones requiring an API key
(FR-003).

## 2. Try an open operation

Expand `POST /user` → "Try it out" → fill in a body, e.g.:

```json
{ "username": "docs-check", "email": "docs-check@example.com", "password": "Str0ngPass!23" }
```

→ Execute. Expect a real `200` response with the created account (no `password` field), per
`specs/002-user-api-key-auth/contracts/user-api.md`.

## 3. Authorize and try a protected operation

1. Expand `GET /user/login` → "Try it out" → `username=docs-check`, `password=Str0ngPass!23` →
   Execute. Expect `200` with the issued API key as the response body.
2. Click the page's "Authorize" button, paste that key into the `api_key` field, confirm.
3. Expand `GET /user/{username}` → "Try it out" → `username=docs-check` → Execute. Expect a real
   `200` with the account's details (FR-004, FR-005).
4. Click "Authorize" again and clear the key, then repeat step 3. Expect a real `401`
   (`Missing or invalid api_key header`) — the page shows the server's actual rejection, not a
   client-side validation error.

## 4. Confirm the served document matches the contract

```sh
curl -s http://localhost:3000/docs-json | python3 -c "
import json, sys
served = json.load(sys.stdin)
committed = json.load(open('packages/api/swagger/openapi_pet_store.json'))
committed['servers'] = served['servers']  # the one deliberate override, see data-model.md
assert served == committed, 'served document drifted from the committed contract'
print('OK: served document matches the committed contract (modulo servers override)')
"
```

## 5. Automated coverage

```sh
npm run test --workspace packages/api      # includes buildOpenApiDocument() unit test
npm run test:e2e --workspace packages/api  # includes the /docs and /docs-json e2e assertions
```

## What this validates

Every acceptance scenario in `spec.md`'s two user stories (browsing the documented operations,
and trying both an open and a protected one directly from the page), plus FR-006's "always
matches the published contract" requirement from `contracts/docs-endpoints.md`.
