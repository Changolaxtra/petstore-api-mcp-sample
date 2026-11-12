# Contract: `create_pet` MCP Tool

This is the external interface this feature exposes — the one MCP tool, as discovered and called by an MCP client (MCP Inspector, Claude, or any other MCP-compatible agent) over the server's Streamable HTTP transport at `/mcp`.

## Tool identity

- **Name**: `create_pet`
- **Description (as advertised to the calling LLM/agent)**: Creates a new pet record in the Pet Store. Requires a name and at least one photo URL; category, tags, and status are optional.

## Input schema

```jsonc
{
  "name": "string",            // required, non-empty
  "photoUrls": ["string"],      // required, at least 1 entry
  "category": {                 // optional — only `name`; `id` is server-assigned
    "name": "string"
  },
  "tags": [                     // optional — only `name`; `id` is server-assigned
    { "name": "string" }
  ],
  "status": "available"         // optional: "available" | "pending" | "sold"
}
```

Backed by `CreatePetInput` in [`../data-model.md`](../data-model.md). Each field's `@SchemaConstraint` description is the actual text shown to the calling model, not an internal comment.

## Success output

```jsonc
{
  "id": 123,
  "name": "string",
  "category": { "id": 0, "name": "string" },
  "photoUrls": ["string"],
  "tags": [{ "id": 0, "name": "string" }],
  "status": "available"
}
```

Corresponds to `Pet` in [`../data-model.md`](../data-model.md) — the same shape `POST /pet` on the API returns, generated from the OpenAPI contract rather than hand-typed.

**Maps to spec**: FR-005, User Story 1 (Acceptance Scenario 2), User Story 2 (Acceptance Scenario 1).

## Error output

Returned as a tool-call error (not a raw exception) in every case below — the model never sees an Axios stack trace. LeanMCP only supports a message-only error channel: a thrown `Error` always becomes exactly `{ content: [{ type: 'text', text: 'Error: ' + error.message }], isError: true }`, with no room for extra fields alongside the top-level `isError`. To still deliver a structured error, `error.message` **is** the JSON encoding of the structure below, so `content[0].text` is:

```
Error: {"isError":true,"content":{"errorCategory":"...","isRetryable":...,"message":"...","attempted_query":"...","partial_results":null}}
```

```jsonc
// The JSON decoded from content[0].text, after stripping the fixed "Error: " prefix:
{
  "isError": true,
  "content": {
    "errorCategory": "transient",       // "validation" | "transient" | "permanent"
    "isRetryable": true,
    "message": "string",
    "attempted_query": "create_pet(name=\"Rex\")",
    "partial_results": null             // always null for this tool
  }
}
```

| Trigger | `errorCategory` | `isRetryable` | Example `message` |
|---|---|---|---|
| Missing/empty/wrong-typed `name` or `photoUrls` | `validation` | `false` | "name is required and must be non-empty." (checked explicitly in `PetService.create_pet` — LeanMCP's stateless HTTP mode does not reliably gate calls on the advertised JSON Schema before invoking the tool method, so this is not left to framework-level AJV validation) |
| API responds with a 4xx (e.g. its own validation failure) | `validation` | `false` | "The Pet Store API rejected the request (status 400): name should not be empty" |
| API responds with a 5xx | `transient` | `true` | "The Pet Store API failed to process the request (status 500). Try again later. Detail: Unexpected error" |
| API unreachable / network error / timeout | `transient` | `true` | "Could not reach the Pet Store API. The service may be starting up or unavailable." |
| Any other, non-Axios failure | `permanent` | `false` | The underlying error's own message. |

Corresponds to `StructuredToolError` in [`../data-model.md`](../data-model.md).

**Maps to spec**: FR-003, FR-006, Edge Cases, User Story 2 (Acceptance Scenarios 2–3), Success Criteria SC-004.

## Underlying API call

- `POST /pet` on `packages/api` (per `packages/api/swagger/openapi_pet_store.json`), with the `api_key` header attached by the MCP server itself (see [`../research.md`](../research.md) §4) — never supplied by or exposed to the calling agent.
- This call is **never retried** by the MCP server's HTTP client, since it is non-idempotent (`packages/mcp/CLAUDE.md`).

## Discoverability contract

Any MCP client (MCP Inspector included) connecting to `http://<host>:<port>/mcp` and listing tools MUST see `create_pet` with the input schema and description above, without needing to read source code (spec FR-007, FR-008, SC-001).
