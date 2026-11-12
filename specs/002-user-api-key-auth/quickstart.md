# Quickstart: Validating User Operations & API Key Authentication

Prerequisites: Docker Compose, the repo's root `.env` populated from `.env.example` (adds
`VALKEY_URL` and `API_KEY_TTL_SECONDS` alongside the existing Postgres vars once this feature's
tasks land them).

## 1. Bring the stack up

```sh
docker compose up --build
```

Expect, in order: `postgres` becomes healthy → `liquibase` applies every changeset in
`packages/api/migrations/db.changelog-master.yaml` (including the new `0010-seed-test-user.sql`)
and exits `0` → `valkey` becomes healthy → `api` starts once both `liquibase` (completed) and
`valkey` (healthy) are satisfied.

## 2. Confirm the seed landed

```sh
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT username, email FROM users;"
```

Expect one row for the preloaded test account (credentials documented in the project
`README.md`, per FR-013).

## 3. Open operations (no API key needed)

```sh
# Create a second account
curl -s -X POST http://localhost:3000/user \
  -H 'Content-Type: application/json' \
  -d '{"username":"quickstart-user","email":"qs@example.com","password":"Str0ngPass!23"}'

# Log in as the seeded test account — response body is the bare API key string
API_KEY=$(curl -s "http://localhost:3000/user/login?username=<test-username>&password=<test-password>" \
  | tr -d '"')
echo "$API_KEY"
```

Expect: account creation returns the created `User` (no `password` field); login returns a
non-empty token string (see `contracts/user-api.md`).

## 4. Protected operations

```sh
# Without a key — expect 401
curl -i http://localhost:3000/user/quickstart-user

# With the key from step 3 — expect 200
curl -i http://localhost:3000/user/quickstart-user -H "api_key: $API_KEY"

# Update
curl -i -X PUT http://localhost:3000/user/quickstart-user \
  -H "api_key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"phone":"555-0100"}'
```

## 5. Logout invalidates immediately

```sh
curl -i http://localhost:3000/user/logout -H "api_key: $API_KEY"

# Same key, same request as before — now expect 401
curl -i http://localhost:3000/user/quickstart-user -H "api_key: $API_KEY"
```

## 6. Expiry (automated, not manual)

Waiting out the real 30-minute TTL by hand isn't a reasonable manual check. The e2e suite
(`packages/api/test/user.e2e-spec.ts`, per `research.md` §10) covers this instead by booting the
app with `API_KEY_TTL_SECONDS` overridden to a couple of seconds and asserting the key stops
working once that short window elapses. Run it with:

```sh
npm run test:e2e --workspace packages/api
```

## 7. Cleanup

```sh
curl -i -X DELETE http://localhost:3000/user/quickstart-user -H "api_key: $API_KEY_2"  # a key from a fresh login, since the one above was just revoked
```

Expect: `200`, and a follow-up `GET /user/quickstart-user` (with any key) now returns `404`.

## What this validates

Every acceptance scenario in `spec.md`'s three user stories, plus the amended contract from
`contracts/user-api.md`: open account creation and login, API-key-gated read/update/delete,
immediate logout invalidation, and (via the e2e suite) bounded automatic expiry.
