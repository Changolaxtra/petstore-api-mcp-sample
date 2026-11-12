# packages/mcp — LeanMCP server

TypeScript MCP server exposing the Petstore domain (pet / store / user) as MCP tools for LLM agents. This package has **no database access** — it is a thin translation layer that calls `packages/api` over HTTP and maps requests/responses to MCP tool calls.

## Stack
- **LeanMCP** (`@leanmcp/core`) — decorator-based MCP tool framework. Services under `mcp/` are auto-discovered; tools are defined with `@Tool(...)` on a method and `@SchemaConstraint(...)` on each field of a dedicated input class.
- HTTP client: **Axios** — mature, interceptor support (retries/auth/logging), wide ecosystem (`axios-retry`), works the same in Node and in tests with `nock`/MSW. Use a single shared Axios instance (base URL, timeout, interceptors) rather than ad hoc `fetch` calls scattered across services.
- Generate the request/response types for that Axios client from `packages/api/swagger/openapi_pet_store.json` (e.g. `openapi-typescript` or `orval`) instead of hand-writing interfaces — this package's view of the API should never drift from the real contract.
- Transport: LeanMCP serves MCP over Streamable HTTP (Express under the hood) at `/mcp` — there is no stdio transport here.

## Structure
```
main.ts         entry point, boots the LeanMCP HTTP server
mcp/
  pet/          PetService — tools mirroring /pet* endpoints
  store/        StoreService — tools mirroring /store* endpoints
  user/         UserService — tools mirroring /user* endpoints
  http/         shared Axios client + generated API types
```
One service (and tool group) per OpenAPI tag — the same domain boundary as the API package's modules. Keep the two packages' domain splits in sync.

## Tool design conventions
- One `@Tool` per API operation (or a small, obviously-related cluster) — don't collapse unrelated operations into one mega-tool just to cut boilerplate.
- Every tool's input class uses `@SchemaConstraint` with a real `description` — that description is what the LLM sees to decide how to call the tool, so write it for that audience, not as an internal code comment.
- Tools return the data the API gave back, mapped through the generated types — not the raw Axios response. Unwrap `AxiosResponse` in the HTTP client layer, not in each tool.
- Map upstream HTTP errors (4xx/5xx from the API) to clear MCP tool errors; don't let a raw Axios exception/stack trace leak back to the model.

## HTTP client conventions
- Base URL comes from an `API_BASE_URL` env var (e.g. `http://api:3000` inside Docker Compose, `http://localhost:3000` locally) — never hardcode it.
- Set an explicit timeout and a small retry budget (`axios-retry`), retrying only network errors/5xx on idempotent requests (GETs) — never blindly retry non-idempotent writes like order creation without an idempotency key.
- Centralize the Axios instance in `mcp/http/` and inject it into services — don't instantiate Axios per-service.

## Testing
- Unit test each tool/service with the Axios client mocked (`nock` or `axios-mock-adapter`) — assert on the request made and the mapped response, not on live network calls.
- Integration tests run against the real `api` service (via Docker Compose) to catch contract drift that type generation alone wouldn't.

## Local dev
- `npm run dev` boots the LeanMCP server on its configured port; verify tools via the MCP Inspector against `http://localhost:<port>/mcp`.
- In Docker Compose, this service must start only after `api` is healthy (`depends_on: api: condition: service_healthy`).
