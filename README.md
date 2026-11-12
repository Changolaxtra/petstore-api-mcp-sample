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

## Running tests

```sh
npm run test --workspace packages/api      # unit tests
npm run test:e2e --workspace packages/api  # e2e tests against real Postgres + Valkey (testcontainers)
```

## Project layout

See `CLAUDE.md` for the full architecture and tech stack, and each package's own `CLAUDE.md`
(`packages/api/CLAUDE.md`, `packages/mcp/CLAUDE.md`) for stack-specific conventions.
