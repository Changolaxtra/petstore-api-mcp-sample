# Petstore API + MCP Sample

TypeScript monorepo demonstrating a NestJS REST API (Swagger Petstore) paired with an MCP server
that exposes the same domain as LLM-callable tools over HTTP. See `CLAUDE.md` for the full
architecture; this file is the practical "how do I run it" guide.

> This is a non-production sample project. The preloaded test account's password below is
> intentionally documented in plain text for developer convenience.

## Prerequisites

- Docker and Docker Compose
- Node.js 22.x (see `.nvmrc`) if you want to run `packages/api` outside Docker

## 1. Configure environment variables

```sh
cp .env.example .env
```

The defaults in `.env.example` work as-is for local development.

## 2. Start the stack

```sh
docker compose up --build
```

This brings up, in order:

1. `postgres` — PostgreSQL, until it reports healthy.
2. `liquibase` — applies every changeset in `packages/api/migrations/`, including the seed
   changeset that creates the preloaded test account (see below), then exits `0`. This runs on
   every `docker compose up`, not just the first time — Liquibase's own change-tracking makes a
   rerun against an already-migrated database a no-op.
3. `valkey` — the API-key session store, until it reports healthy.
4. `api` — the NestJS API, once `liquibase` has completed and `valkey` is healthy.

The API is then available at `http://localhost:3000`, with a health check at
`http://localhost:3000/health`.

Interactive API docs are at `http://localhost:3000/docs` — a Swagger UI generated directly from
the committed contract (`packages/api/swagger/openapi_pet_store.json`), so it's always in sync
with the real API. It's not just a static reference: use "Try it out" to call any operation for
real, and "Authorize" to set your `api_key` once and have it applied to every protected call
afterward. See `specs/003-swagger-ui-docs/quickstart.md` for a walkthrough.

## 3. The preloaded test account

| Field      | Value                   |
|------------|--------------------------|
| `username` | `testuser`               |
| `password` | `Petstore123!`           |
| `email`    | `testuser@example.com`   |

Seeded by `packages/api/migrations/0010-seed-test-user.sql` so you can exercise the auth flow
immediately without creating an account first. The password is stored only as an Argon2id hash —
nowhere in the database is it kept in plain text.

## 4. Creating an account

```sh
curl -s -X POST http://localhost:3000/user \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"Str0ngPass!23"}'
```

Returns the created account (never including the password).

## 5. Logging in and using the resulting API key

Authentication uses a single `api_key` request header — log in once to obtain a key, then send
that key on every subsequent request to a protected operation:

```sh
# Log in — the response body is the API key itself, as a bare JSON string
API_KEY=$(curl -s "http://localhost:3000/user/login?username=testuser&password=Petstore123!" | tr -d '"')

# Use it on a protected operation
curl -s http://localhost:3000/user/testuser -H "api_key: $API_KEY"
```

Every issued API key automatically stops working **30 minutes** after it was issued
(`API_KEY_TTL_SECONDS` in `.env`, enforced natively by Valkey's key expiry — no polling or sweeper
involved). You can also end a session immediately:

```sh
curl -s http://localhost:3000/user/logout -H "api_key: $API_KEY"
```

After logout (or expiry), that same key is rejected on any further request.

### Which operations need the key

| Operation | Needs `api_key`? |
|-----------|-------------------|
| Create an account (`POST /user`) | No |
| Log in (`GET /user/login`) | No |
| Log out (`GET /user/logout`) | **Yes** |
| Get an account (`GET /user/{username}`) | **Yes** |
| Update an account (`PUT /user/{username}`) | **Yes** |
| Delete an account (`DELETE /user/{username}`) | **Yes** |

See `specs/002-user-api-key-auth/contracts/user-api.md` for the full contract, and
`specs/002-user-api-key-auth/quickstart.md` for a longer end-to-end walkthrough.

## 6. Managing the pet catalog

Every `pet`-tag operation requires the `api_key` header (same key obtained via `/user/login`
above):

```sh
curl -s -X POST http://localhost:3000/pet \
  -H "api_key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Rex","photoUrls":["https://example.com/rex.jpg"],"category":{"name":"Dogs"},"tags":[{"name":"friendly"}],"status":"available"}'

curl -s "http://localhost:3000/pet/findByStatus?status=available" -H "api_key: $API_KEY"
curl -s "http://localhost:3000/pet/findByTags?tags=friendly" -H "api_key: $API_KEY"

curl -s -X POST "http://localhost:3000/pet/1/uploadImage" \
  -H "api_key: $API_KEY" -H 'Content-Type: application/octet-stream' \
  --data-binary @./rex.jpg
```

A pet with an order on file can't be deleted (`409`) until that order is removed. See
`specs/004-complete-pet-store-api/contracts/pet-api.md` for the full contract.

## 7. Placing and managing orders

`store`-tag order operations are open (no `api_key`); the inventory summary requires it:

```sh
curl -s -X POST http://localhost:3000/store/order \
  -H 'Content-Type: application/json' -d '{"petId":1,"quantity":1}'

curl -s http://localhost:3000/store/order/1
curl -s -X DELETE http://localhost:3000/store/order/1
curl -s http://localhost:3000/store/inventory -H "api_key: $API_KEY"
```

See `specs/004-complete-pet-store-api/contracts/store-api.md` for the full contract.

## 8. Registering several accounts at once

```sh
curl -s -X POST http://localhost:3000/user/createWithList \
  -H 'Content-Type: application/json' \
  -d '[{"username":"alice","password":"Str0ngPass!23"},{"username":"bob","password":"Str0ngPass!24"}]'
```

All-or-nothing: if any account in the batch collides with an existing account or with another
entry in the same batch, the whole batch is rejected (`409`) and none of it is created. See
`specs/004-complete-pet-store-api/contracts/bulk-user-registration.md` for the full contract.

## Running tests

```sh
npm run test --workspace packages/api      # unit tests
npm run test:e2e --workspace packages/api  # e2e tests against real Postgres + Valkey (testcontainers)
```

## Project layout

See `CLAUDE.md` for the full architecture and tech stack, and each package's own `CLAUDE.md`
(`packages/api/CLAUDE.md`, `packages/mcp/CLAUDE.md`) for stack-specific conventions.
