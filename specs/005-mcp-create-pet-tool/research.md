# Research: MCP Server Scaffold with Create-Pet Tool

All items below were fully determined from the project's own `CLAUDE.md` files, its ratified constitution, and inspection of the existing `packages/api` implementation — no `NEEDS CLARIFICATION` markers remain from the Technical Context.

## 1. MCP server framework and transport

- **Decision**: Use `@leanmcp/core`, serving MCP over Streamable HTTP (Express under the hood) at `/mcp`, as mandated by `packages/mcp/CLAUDE.md`.
- **Rationale**: Already the project's binding technology choice (constitution "Additional Constraints" and `packages/mcp/CLAUDE.md`). Streamable HTTP is also what lets MCP Inspector connect to a running container by URL rather than by spawning a local process, which matches "discoverable via a standard MCP inspection tool" from the spec (FR-007).
- **Alternatives considered**: A stdio transport (common for local-only MCP servers) was rejected — it would require the inspector/agent to spawn the process directly, which doesn't fit "runs in another container, sibling to the API" (spec input) or the project's documented transport choice.

## 2. HTTP client to the API

- **Decision**: A single shared Axios instance (base URL from `API_BASE_URL`, explicit timeout, `axios-retry` bounded to idempotent GET requests only) centralized in `mcp/http/api-client.ts`.
- **Rationale**: Directly specified in `packages/mcp/CLAUDE.md` and the constitution's Additional Constraints. `create_pet` maps to a `POST /pet`, which is non-idempotent, so it is explicitly excluded from the retry policy — a retried create could otherwise produce duplicate pets.
- **Alternatives considered**: Raw `fetch` calls per tool (rejected — no shared interceptor/retry/timeout story, and explicitly discouraged by `packages/mcp/CLAUDE.md`); retrying the create call on 5xx (rejected — violates the "never blindly retry non-idempotent writes" rule and could create duplicate pet records).

## 3. Request/response types for the API client

- **Decision**: Generate TypeScript types from `packages/api/swagger/openapi_pet_store.json` using `openapi-typescript`, committed as a generated file (`mcp/http/types.generated.ts`) with a `package.json` script to regenerate it.
- **Rationale**: Constitution Principle I (Contract-First Development) requires the MCP package's HTTP client types to be derived from the OpenAPI contract, never hand-maintained. `openapi-typescript` is the lighter of the two options named in `packages/mcp/CLAUDE.md` (the other being `orval`) and is sufficient since this feature only needs types, not a generated client — Axios calls are still hand-written against those types.
- **Alternatives considered**: `orval` (rejected for this scope — it also generates client functions/hooks, which is more than this single-tool scaffold needs); hand-written interfaces (rejected — explicitly prohibited by Principle I).

## 4. Authenticating the MCP server's calls to the API

- **Decision**: On startup (and again whenever a call receives `401 Unauthorized`), the MCP server calls `GET /user/login` on the API using credentials supplied via `MCP_API_USERNAME` / `MCP_API_PASSWORD` environment variables, caches the returned `api_key` in memory, and attaches it as the `api_key` header on every subsequent call to the API — including `create_pet`'s `POST /pet`. The key is never returned to, or accepted from, the calling agent/end user.
- **Rationale**: Inspection of `packages/api/src/pet/pet.controller.ts` shows `@UseGuards(ApiKeyGuard)` applied at the controller level, so `POST /pet` requires a valid `api_key` header despite the OpenAPI spec also listing an OAuth2 scheme as an alternative. `packages/api/src/security/api-key-store.service.ts` backs that key with a TTL (`API_KEY_TTL_SECONDS`, default 1800s in `.env.example`), so a single key obtained once and hardcoded would silently expire. Logging in lazily and re-logging in on `401` keeps the MCP server self-sufficient without an operator having to rotate a key by hand. This satisfies spec FR-011 ("tool server MUST authenticate ... without exposing that credential to the calling agent or end user").
- **Alternatives considered**: A single long-lived API key supplied directly via env var (rejected — expires after `API_KEY_TTL_SECONDS` and has no renewal path, causing the tool to silently start failing); having the calling agent supply credentials per-call (rejected — spec explicitly scopes authentication as the tool server's own responsibility, and leaking the credential into the agent/tool-call surface is exactly what FR-011 rules out).

## 5. Discoverability via MCP Inspector

- **Decision**: No special scaffolding beyond standard LeanMCP tool registration is required — `@Tool` + `@SchemaConstraint` decorators on `PetService.createPet` and its input DTO are enough for MCP Inspector (or any MCP client) to list and introspect the capability once connected to `http://<host>:<port>/mcp`.
- **Rationale**: This is exactly what `@leanmcp/core`'s decorator-based discovery is designed to do; no custom introspection endpoint is needed.
- **Alternatives considered**: Hand-writing a custom `/tools` listing endpoint (rejected — redundant with what the MCP protocol/SDK already provides, and would drift from the real tool registration).

## 6. Documentation for connecting Claude/other agents

- **Decision**: Ship a `packages/mcp/README.md` with a copy-pasteable JSON configuration snippet for Claude Desktop's `mcpServers` config block (pointing at the server's `/mcp` URL), plus a short note that any MCP-compatible client configured the same way (URL + Streamable HTTP transport) will work identically.
- **Rationale**: Directly required by spec FR-009 and User Story 3; keeping it next to the package it describes (rather than only in `specs/`) makes it discoverable by someone who has never seen the Spec Kit artifacts.
- **Alternatives considered**: Putting the config only in `quickstart.md` under `specs/` (rejected as the sole location — that directory is not where a new contributor or operator would naturally look; it will still be linked from there).

## 7. Testing approach

- **Decision**: Jest unit tests for `PetService.createPet` with the Axios client mocked (`axios-mock-adapter`, already the pattern implied for consistency with `nock`/MSW options named in `packages/mcp/CLAUDE.md`); no integration test against a live `api` container is added in this feature (deferred — `packages/mcp/CLAUDE.md` describes integration tests against the real `api` service as a general package convention, not a requirement of this specific single-tool scaffold).
- **Rationale**: Matches the testing convention already documented for the package while keeping this feature's scope to exactly what the spec asks for (one tool, scaffolded).
- **Alternatives considered**: Adding a `testcontainers`-style full-stack integration test now (deferred, not rejected — reasonable follow-up once more tools exist, but out of scope per spec's Assumptions: "Only the create-pet capability is in scope for this feature").
