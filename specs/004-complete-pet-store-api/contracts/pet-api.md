# Contract: Pet HTTP Operations

Source of truth: `packages/api/swagger/openapi_pet_store.json`, `pet` tag. This feature adds
`{"api_key": []}` as an additional security alternative to the operations whose `security` list
below is marked **amended** (see `research.md` §3) — it does not otherwise reshape any operation
or the `Pet`/`Category`/`Tag` schemas.

| Operation (`operationId`) | Method & Path | Auth required | Notes |
|---|---|---|---|
| `addPet` | `POST /pet` | **Yes** (amended) | FR-001. Category/tags resolved by name (`research.md` §5). Single write transaction (§4). |
| `updatePet` | `PUT /pet` | **Yes** (amended) | FR-003. Identified by the `id` in the request body (matches the committed `Pet` schema — there's no path parameter on this operation). `404` if no such pet. |
| `updatePetWithForm` | `POST /pet/{petId}` | **Yes** (amended) | FR-003, partial update via `name`/`status` query params only — shares `PetService.update()` with `updatePet`, just with a narrower input shape. |
| `deletePet` | `DELETE /pet/{petId}` | **Yes** (amended) | FR-004. `409` (not the contract's generic `400`) if the pet still has an order on file — a clearer status than lumping it in with "invalid pet value". The previously-unused standalone `api_key` header *parameter* on this operation is removed as redundant now that a proper `security` entry covers it (§3). |
| `findPetsByStatus` | `GET /pet/findByStatus` | **Yes** (amended) | FR-006. `status` is a comma-delimited query value (§6), e.g. `?status=available,pending`. |
| `findPetsByTags` | `GET /pet/findByTags` | **Yes** (amended) | FR-007. `tags` is a comma-delimited query value (§6), e.g. `?tags=tag1,tag2`. |
| `getPetById` | `GET /pet/{petId}` | **Yes** (already declared) | FR-002. `404` if no such pet. |
| `uploadFile` | `POST /pet/{petId}/uploadImage` | **Yes** (amended) | FR-008. Raw `application/octet-stream` body (§7); stored and served per §8. `404` if no such pet. Response is the committed `ApiResponse` shape (`{code, type, message}`). |

## Contract amendment (this feature)

For `addPet`, `updatePet`, `updatePetWithForm`, `deletePet`, `findPetsByStatus`,
`findPetsByTags`, and `uploadFile`, this feature adds:

```json
{ "api_key": [] }
```

as an additional entry in that operation's existing `security` array (which today holds only
`petstore_auth`) — both entries remain listed as alternatives; this implementation satisfies the
`api_key` one. `deletePet`'s standalone `api_key` header parameter (not a `security` entry, and
never enforced) is removed. `getPetById` is untouched — it already lists `api_key` as an
alternative.

## Error shape

Same shared NestJS exception filter as every other module (`{statusCode, message}`) — no new
error shape introduced, per `packages/api/CLAUDE.md`.
