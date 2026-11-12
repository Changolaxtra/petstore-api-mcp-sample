# Quickstart: Validating the Completed Pet Store API

Prerequisites: stack running via `docker compose up --build` (see root `README.md`), and a valid
`api_key` (log in as the preloaded test account — see `README.md` — or create your own per
`specs/002-user-api-key-auth/quickstart.md`).

```sh
API_KEY=$(curl -s "http://localhost:3000/user/login?username=testuser&password=Petstore123!" | tr -d '"')
```

## 1. Manage the pet catalog (User Story 1)

```sh
# Create a pet — category and tags are resolved by name
PET=$(curl -s -X POST http://localhost:3000/pet \
  -H "api_key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Rex","category":{"name":"Dogs"},"photoUrls":["https://example.com/rex.jpg"],"tags":[{"name":"friendly"}],"status":"available"}')
echo "$PET"
PET_ID=$(echo "$PET" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

# Retrieve it
curl -s -H "api_key: $API_KEY" http://localhost:3000/pet/$PET_ID

# Update it
curl -s -X PUT http://localhost:3000/pet \
  -H "api_key: $API_KEY" -H 'Content-Type: application/json' \
  -d "{\"id\":$PET_ID,\"name\":\"Rex\",\"photoUrls\":[\"https://example.com/rex.jpg\"],\"status\":\"pending\"}"
```

Expect: `200` with the pet's full details each time; the second call's `status` reflects
`"pending"`.

## 2. Find a pet to buy (User Story 2)

```sh
curl -s -H "api_key: $API_KEY" "http://localhost:3000/pet/findByStatus?status=pending"
curl -s -H "api_key: $API_KEY" "http://localhost:3000/pet/findByTags?tags=friendly"

# Upload an image for it
curl -s -X POST "http://localhost:3000/pet/$PET_ID/uploadImage" \
  -H "api_key: $API_KEY" -H 'Content-Type: application/octet-stream' \
  --data-binary @/path/to/some-image.jpg

curl -s -H "api_key: $API_KEY" http://localhost:3000/pet/$PET_ID
```

Expect: both searches return the pet created above (and no others); after the upload, the pet's
`photoUrls` includes a new entry alongside the original one (FR-008 — additive, not replacing).

## 3. Place and manage an order (User Story 3)

```sh
ORDER=$(curl -s -X POST http://localhost:3000/store/order \
  -H 'Content-Type: application/json' \
  -d "{\"petId\":$PET_ID,\"quantity\":1,\"shipDate\":\"2026-12-01T00:00:00Z\",\"status\":\"placed\",\"complete\":false}")
echo "$ORDER"
ORDER_ID=$(echo "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -s http://localhost:3000/store/order/$ORDER_ID
curl -s -H "api_key: $API_KEY" http://localhost:3000/store/inventory

curl -s -X DELETE http://localhost:3000/store/order/$ORDER_ID
curl -s -w '\nHTTP %{http_code}\n' http://localhost:3000/store/order/$ORDER_ID  # expect 404

# Placing an order is open (no api_key needed); placing one for a nonexistent pet is refused:
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:3000/store/order \
  -H 'Content-Type: application/json' -d '{"petId":999999,"quantity":1,"status":"placed"}'
```

Expect: `200` for create/get/delete, `404` after deletion, `404` for the nonexistent-pet order,
and the inventory map includes at least `{"pending": 1}` reflecting the pet from step 1.

## 4. Register several accounts at once (User Story 4)

```sh
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:3000/user/createWithList \
  -H 'Content-Type: application/json' \
  -d '[{"username":"bulk-one","password":"Str0ngPass!23"},{"username":"bulk-two","password":"Str0ngPass!23"}]'

curl -s http://localhost:3000/user/bulk-one -H "api_key: $API_KEY"
curl -s http://localhost:3000/user/bulk-two -H "api_key: $API_KEY"

# A batch with one collision creates none of it:
curl -s -w '\nHTTP %{http_code}\n' -X POST http://localhost:3000/user/createWithList \
  -H 'Content-Type: application/json' \
  -d '[{"username":"bulk-three","password":"Str0ngPass!23"},{"username":"bulk-one","password":"Str0ngPass!23"}]'

curl -s -w '\nHTTP %{http_code}\n' http://localhost:3000/user/bulk-three -H "api_key: $API_KEY"  # expect 404 — never created
```

Expect: the first batch creates both accounts; the second batch (`bulk-one` already exists) is
refused entirely, and `bulk-three` — otherwise valid — was never created either (FR-016/SC-005).

## 5. Cleanup

```sh
curl -s -X DELETE http://localhost:3000/pet/$PET_ID -H "api_key: $API_KEY"
```

## 6. Automated coverage

```sh
npm run test --workspace packages/api       # unit tests, incl. transaction-rollback cases
npm run test:e2e --workspace packages/api   # e2e tests against real Postgres + Valkey
```

## What this validates

Every acceptance scenario in `spec.md`'s four user stories, the security amendment from
`contracts/pet-api.md` (every pet operation now genuinely requires `api_key`), and FR-017's
atomicity requirement (exercised directly by the automated test suite's deliberate-failure
cases, not practical to trigger by hand from curl).
