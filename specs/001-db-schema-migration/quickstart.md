# Quickstart: Validate the Petstore Schema Migration

Proves the migration in `packages/api/migrations/` and the diagram in `packages/api/architecture/` actually deliver what `spec.md` promises. See `data-model.md` / `contracts/schema.md` for the full schema shape — this guide only lists how to exercise it.

## Prerequisites

- Docker and Docker Compose available locally.
- The migration changelog exists at `packages/api/migrations/db.changelog-master.yaml`, applied via the `liquibase` Compose service described in the root `CLAUDE.md`.

## 1. Apply the migration to a clean database (validates US1, SC-001)

```bash
docker compose up -d postgres
docker compose up liquibase   # one-shot; must exit 0
```

**Expected**: `liquibase` container exits with status 0 and logs that all changesets in `db.changelog-master.yaml` were applied.

## 2. Confirm every entity exists with the right shape (validates Acceptance Scenario 1)

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
```

**Expected**: `categories`, `tags`, `pets`, `pet_photo_urls`, `pet_tags`, `store_orders`, `users` all listed. Spot-check one table's shape:

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d+ pets"
```

**Expected**: columns/types/constraints match the `pets` table in `contracts/schema.md`.

## 3. Confirm the migration is safe to re-run (validates Acceptance Scenario 2, SC-002)

```bash
docker compose up liquibase
```

**Expected**: exits 0 again, with Liquibase reporting 0 changesets to apply (all already recorded in `DATABASECHANGELOG`) — no errors, no duplicate objects.

## 4. Confirm basic inserts succeed and constraints hold (validates Acceptance Scenario 3, US3, SC-004)

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO categories (name) VALUES ('Dogs');
INSERT INTO pets (name, category_id, status) VALUES ('Rex', 1, 'available');
INSERT INTO tags (name) VALUES ('friendly');
INSERT INTO pet_tags (pet_id, tag_id) VALUES (1, 1);
INSERT INTO pet_photo_urls (pet_id, url, "position") VALUES (1, 'https://example.com/rex.jpg', 0);
INSERT INTO store_orders (pet_id, quantity, status) VALUES (1, 1, 'placed');
-- this one must fail:
INSERT INTO pets (name, status) VALUES ('Bad Status Pet', 'not-a-real-status');
SQL
```

**Expected**: every statement before the last succeeds; the final `INSERT` fails with a `CHECK` constraint violation on `status`.

## 5. Confirm the Pet/Order delete guard (validates FR-011, Edge Cases)

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM pets WHERE id = 1;"
```

**Expected**: fails with a foreign key violation (`store_orders` still references pet `1`) — delete the order first, then the pet succeeds.

## 6. Confirm the diagram matches the schema (validates US2, SC-003, SC-005)

- Open `packages/api/architecture/erd.md` in a Mermaid-compatible viewer (GitHub renders it inline, or use the Mermaid Live Editor).
- Walk the table list from step 2 against the diagram: every table must appear.
- Walk the relationships from `data-model.md`'s Relationships table against the diagram's connecting lines and cardinality markers: every relationship (including delete-behavior-sensitive ones like Pet→Order) must be represented and match.

**Expected**: no table or relationship present in one place and missing from the other.
