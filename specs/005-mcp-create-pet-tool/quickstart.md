# Quickstart: MCP Server Scaffold with Create-Pet Tool

Validation guide for this feature once implemented. Proves the feature end-to-end against the acceptance scenarios in [`spec.md`](./spec.md) and the contract in [`contracts/create-pet-tool.md`](./contracts/create-pet-tool.md). This guide does not duplicate schema details — see `data-model.md` and `contracts/` for those.

## Prerequisites

- Docker Compose stack from the repo root, with `postgres`, `liquibase`, `valkey`, and `api` already working (existing features).
- A `.env` at the repo root with the variables the `mcp` service needs (see `packages/mcp/.env.example` once scaffolded): `API_BASE_URL`, `MCP_API_USERNAME`, `MCP_API_PASSWORD`, `PORT`.
- A registered user account in the API (so `MCP_API_USERNAME`/`MCP_API_PASSWORD` can successfully call `GET /user/login`) — create one via the existing `POST /user` endpoint if needed.
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) available locally (`npx @modelcontextprotocol/inspector` or equivalent) to validate discovery (User Story 1).

## 1. Start the stack

```sh
docker compose up --build
```

Expected: `postgres` becomes healthy → `liquibase` runs and exits 0 → `valkey` becomes healthy → `api` becomes healthy → `mcp` starts (depends on `api` being healthy, per `packages/mcp/CLAUDE.md`).

## 2. Discover the tool with MCP Inspector (User Story 1 / SC-001)

```sh
npx @modelcontextprotocol/inspector
```

Connect it to `http://localhost:<MCP_PORT>/mcp` (Streamable HTTP transport).

**Expected**: the `create_pet` tool is listed with the description and input schema from [`contracts/create-pet-tool.md`](./contracts/create-pet-tool.md), without having read any source code.

## 3. Invoke `create_pet` from the Inspector (User Story 1, Acceptance Scenario 2)

Call `create_pet` with:

```json
{ "name": "Rex", "photoUrls": ["https://example.com/rex.jpg"] }
```

**Expected**: a successful result containing the new pet's `id`, `name`, and `photoUrls`, matching the `Pet` shape in [`data-model.md`](./data-model.md).

## 4. Confirm the failure paths (Edge Cases, SC-004)

- Call `create_pet` with `{ "photoUrls": ["https://example.com/x.jpg"] }` (no `name`). **Expected**: a validation error, no pet created.
- Stop the `api` service (`docker compose stop api`) and call `create_pet` again. **Expected**: an `unreachable`-type error, not a crash or hang. Restart `api` afterward (`docker compose start api`).

## 5. Connect Claude Desktop (User Story 3, FR-009)

Add to Claude Desktop's MCP server configuration (exact file path per Claude Desktop's own docs), using the JSON snippet shipped in `packages/mcp/README.md`:

```json
{
  "mcpServers": {
    "petstore": {
      "url": "http://localhost:<MCP_PORT>/mcp",
      "transport": "http"
    }
  }
}
```

**Expected**: after restarting Claude Desktop, asking it to "create a pet named Rex with a photo at https://example.com/rex.jpg" results in Claude calling `create_pet` and reporting back the created pet's `id`.

## Success criteria mapped

| Step | Validates |
|---|---|
| 2 | SC-001 (discoverable within 1 minute, no source reading) |
| 3 | SC-002 (end-to-end creation in one tool call) |
| 4 | SC-004 (clear errors, no crashes) |
| 5 | SC-003 (documentation-only agent connection) |
