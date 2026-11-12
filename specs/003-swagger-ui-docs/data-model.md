# Data Model: Interactive API Documentation (Swagger UI)

This feature introduces no persisted entities — no new database table, no Valkey-backed state.
The one artifact worth documenting precisely is the in-memory document this feature serves.

## Served OpenAPI Document

Produced by a small pure function (`buildOpenApiDocument()`, see `contracts/docs-endpoints.md`)
each time the app starts. Not persisted anywhere; recomputed on every boot from the file on disk.

| Field | Source | Notes |
|-------|--------|-------|
| Everything except `servers` | Read verbatim from `packages/api/swagger/openapi_pet_store.json` | `info`, `paths`, `components` (including `schemas` and `securitySchemes`), `tags` — byte-for-byte what's committed. This is what makes FR-006 ("no drift") hold by construction. |
| `servers` | Overridden to `[{ "url": "/" }]` | The committed value (`/api/v3`) does not match where this project's routes are actually mounted (root-level, e.g. `/user/login`); see `research.md` §2. This is the only field this feature's code changes from the committed file. |

**Validation rule**: the unit test for this function asserts that a deep-equal comparison of its
output against `{ ...committedFileContents, servers: [{ url: '/' }] }` passes — i.e., the only
permitted difference from the file on disk is that one field.

**State**: none — the document is rebuilt fresh on every app start; there is nothing to migrate,
cache-invalidate, or reconcile across restarts.
