# Contract: Store HTTP Operations

Source of truth: `packages/api/swagger/openapi_pet_store.json`, `store` tag. No contract
amendment here — every operation's security requirement (or lack of one) is implemented exactly
as already committed.

| Operation (`operationId`) | Method & Path | Auth required | Notes |
|---|---|---|---|
| `getInventory` | `GET /store/inventory` | **Yes** (already declared) | FR-014. Returns a map of `status → count` across all pets currently in the catalog. |
| `placeOrder` | `POST /store/order` | No | FR-009/FR-010. `404` if the referenced pet doesn't exist (translated from the `pet_id` foreign-key constraint — no pre-check query needed). Single write transaction (`research.md` §4). |
| `getOrderById` | `GET /store/order/{orderId}` | No | FR-011. `404` if no such order. |
| `deleteOrder` | `DELETE /store/order/{orderId}` | No | FR-012. `404` if no such order. |

## Why these stay open

Unlike every `pet`-tag operation (`contracts/pet-api.md`), the committed contract declares no
security requirement at all for `placeOrder`/`getOrderById`/`deleteOrder` — there is no
`petstore_auth`-only pattern here to extend, and nothing in this feature's request calls for
inventing one. `getInventory` already required `api_key`; this feature simply implements that.

## Error shape

Same shared NestJS exception filter as every other module — no new error shape.
