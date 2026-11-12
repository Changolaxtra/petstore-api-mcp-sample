# Data Model: MCP Server Scaffold with Create-Pet Tool

`packages/mcp` holds no persistent storage (Constitution Principle III/IV — no database access from this package). The entities below are the in-flight shapes the `create_pet` tool works with, all derived from `packages/api/swagger/openapi_pet_store.json`'s `Pet`/`Category`/`Tag` schemas rather than hand-defined independently (Principle I).

## CreatePetInput (tool input)

The shape the `create_pet` MCP tool accepts, validated before any call is made to the API (spec FR-002, FR-003).

| Field | Type | Required | Validation / Notes |
|---|---|---|---|
| `name` | string | Yes | Non-empty. Matches `Pet.name` (required in the OpenAPI `Pet` schema). |
| `photoUrls` | string[] | Yes | At least one entry. Matches `Pet.photoUrls` (required array in the OpenAPI `Pet` schema). |
| `category` | `{ name: string }` | No | The OpenAPI `Pet` schema's `category` allows an optional `id` too, but the API's actual `createPet` implementation (`CreatePetDto`) only accepts/validates `name` for a new category — `id` is server-assigned, not a create-time input. |
| `tags` | `{ name: string }[]` | No | Same narrowing as `category`: the API's `createPet` implementation only accepts `name` per tag on creation. |
| `status` | `"available" \| "pending" \| "sold"` | No | Matches `Pet.status` enum. Left unset defers to whatever default the API applies. |

Each field carries a `@SchemaConstraint` description written for the calling LLM/agent, not as an internal code comment (per `packages/mcp/CLAUDE.md`'s tool design conventions).

**Validation rule (FR-003)**: if `name` is missing/empty or `photoUrls` is missing/empty, the tool MUST reject the call with a clear validation error before any HTTP request is made to the API.

## Pet (tool output, success case)

The shape returned to the caller on success (spec FR-005), generated from the OpenAPI `Pet` schema (`mcp/http/types.generated.ts`) — the same type the API itself returns from `POST /pet`.

| Field | Type | Notes |
|---|---|---|
| `id` | number | Assigned by the API; the identifier the spec's acceptance scenarios require be returned to the caller. |
| `name` | string | Echoed back from the request. |
| `category` | `{ id?: number; name?: string }` | Optional, with its server-assigned `id` now present. |
| `photoUrls` | string[] | Echoed back from the request. |
| `tags` | `{ id?: number; name?: string }[]` | Optional, with each tag's server-assigned `id` now present. |
| `status` | string | Set by the API if not provided by the caller. |

## StructuredToolError (tool output, failure case)

Not a persisted entity. LeanMCP (`@leanmcp/core`) only lets a tool surface a failure by throwing a plain `Error`, which it always renders as the protocol-level `{ content: [{ type: 'text', text: 'Error: ' + error.message }], isError: true }` — there is no channel to attach extra fields alongside that top-level `isError`. To still give the caller the structured fields below, `error.message` itself is the JSON encoding of this shape, so `content[0].text` is `"Error: " + JSON.stringify(StructuredToolErrorBody)`. A caller that wants the structured fields parses the JSON after that fixed `"Error: "` prefix; a caller that only checks the protocol-level `isError` still gets a correct one.

**`StructuredToolErrorBody`** (the JSON encoded into `error.message`):

| Field | Type | Notes |
|---|---|---|
| `isError` | `true` | Always `true`; mirrors the protocol-level flag for a caller inspecting the decoded JSON directly. |
| `content` | `ToolErrorContent` | The structured detail below. |

**`ToolErrorContent`**:

| Field | Type | Notes |
|---|---|---|
| `errorCategory` | `"validation" \| "transient" \| "permanent"` | `validation`: bad input or an API 4xx (fix the request, don't retry as-is). `transient`: API 5xx or unreachable (safe to retry later). `permanent`: an unexpected, non-Axios failure. |
| `isRetryable` | boolean | `true` only for `transient`; `false` for `validation`/`permanent`. |
| `message` | string | Human-readable explanation suitable for an agent to relay to its end user. |
| `attempted_query` | `string \| null` | What was attempted, e.g. `create_pet(name="Rex")` — built from the input even when validation rejects it before any HTTP call. |
| `partial_results` | `null` | Always `null` for this tool — `create_pet` is a single atomic request with no partial-completion concept. |

| Trigger | `errorCategory` | `isRetryable` |
|---|---|---|
| Pre-flight validation (missing/empty/wrong-typed `name` or `photoUrls`) | `validation` | `false` |
| API responds with a 4xx | `validation` | `false` |
| API responds with a 5xx | `transient` | `true` |
| API unreachable / network error / timeout | `transient` | `true` |
| Any other, non-Axios failure | `permanent` | `false` |

## AgentConnectionConfig (documentation artifact, not runtime data)

Not state the server holds — the JSON snippet documented for operators configuring Claude Desktop or another MCP-compatible agent (spec FR-009, User Story 3). Captured here only so the shape is tracked as a first-class part of this feature's deliverables.

| Field | Type | Notes |
|---|---|---|
| `mcpServers.<name>.url` | string | The running server's `/mcp` endpoint, e.g. `http://localhost:<port>/mcp`. |
| `mcpServers.<name>.transport` | string | `"http"` / streamable-HTTP, matching the server's actual transport. |

No state transitions apply to any entity above — `create_pet` is a single-step create operation with no intermediate states.
