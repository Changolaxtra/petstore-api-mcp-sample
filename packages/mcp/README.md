# @petstore/mcp

A [LeanMCP](https://www.npmjs.com/package/@leanmcp/core) server that exposes the Petstore domain as MCP tools for LLM agents. It talks to `packages/api` only over HTTP — it never touches the database directly (see the root [`CLAUDE.md`](../../CLAUDE.md)).

This package currently exposes exactly one tool: **`create_pet`**.

## What `create_pet` does

Creates a new pet record in the Pet Store.

| Field       | Required | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| `name`      | Yes      | Non-empty string.                            |
| `photoUrls` | Yes      | At least one photo URL.                      |
| `category`  | No       | `{ name: string }`                           |
| `tags`      | No       | `{ name: string }[]`                         |
| `status`    | No       | One of `"available"`, `"pending"`, `"sold"`. |

On success, returns the created pet (including the `id` assigned by the API).

On failure, it never crashes or leaks a raw exception — it throws, so the standard MCP `isError: true` is set, and the error's message is a JSON string a caller can parse for structured detail:

```jsonc
{
  "isError": true,
  "content": {
    "errorCategory": "transient", // "validation" | "transient" | "permanent"
    "isRetryable": true,
    "message": "Could not reach the Pet Store API. The service may be starting up or unavailable.",
    "attempted_query": "create_pet(name=\"Rex\")",
    "partial_results": null,
  },
}
```

`errorCategory`/`isRetryable` distinguish "fix your input and don't retry" (`validation`) from "safe to retry later" (`transient`). See [`../../specs/005-mcp-create-pet-tool/contracts/create-pet-tool.md`](../../specs/005-mcp-create-pet-tool/contracts/create-pet-tool.md) for the full contract, including the one framework-imposed quirk: LeanMCP always prefixes the raw error text with `"Error: "` before this JSON.

## Running it

### Locally

```sh
cp .env.example .env   # then edit MCP_API_USERNAME/MCP_API_PASSWORD to a real user
npm run build --workspace packages/mcp
npm run start --workspace packages/mcp
```

The server listens on `PORT` (default `3001`) and serves MCP over Streamable HTTP at `http://localhost:3001/mcp`.

`MCP_API_USERNAME`/`MCP_API_PASSWORD` must already be a registered user in the API (create one via `POST /user` if needed) — this server logs in with them itself to obtain the `api_key` it needs to call `POST /pet`; that credential is never exposed to a calling agent.

### Via Docker Compose

```sh
docker compose up --build
```

`mcp` starts as its own container, sibling to `api`, once `api` is healthy. It is reachable at `http://localhost:${MCP_PORT}/mcp` (see the root `.env.example` for `MCP_PORT`/`MCP_API_USERNAME`/`MCP_API_PASSWORD`).

## Verifying it with MCP Inspector

```sh
npx @modelcontextprotocol/inspector
```

Connect it to `http://localhost:<port>/mcp` using the Streamable HTTP transport. `create_pet` should appear in the tool list with the description and input schema above — no source reading required.

## Connecting Claude Desktop (or any other MCP-compatible agent)

Add this to Claude Desktop's MCP server configuration:

```json
{
  "mcpServers": {
    "petstore": {
      "url": "http://localhost:3001/mcp",
      "transport": "http"
    }
  }
}
```

Replace `3001` with whatever `PORT`/`MCP_PORT` the server is actually running on. Restart the agent after saving the config. Any other MCP-compatible agent that supports a Streamable HTTP MCP server works the same way — point it at the same `url`/`transport` pair.

Once connected, asking the agent to "create a pet named Rex with a photo at https://example.com/rex.jpg" should result in it calling `create_pet` and reporting back the created pet's `id`.

## Structure

```
main.ts                        Entry point; boots the LeanMCP Streamable HTTP server
mcp/
  pet/
    index.ts                   PetService — the create_pet tool (auto-discovered by LeanMCP)
    dto/create-pet.input.ts    Input schema for create_pet
  http/
    api-client.ts               Shared Axios client to packages/api
    auth.ts                     Login + in-memory api_key cache against /user/login
    error-mapper.ts              Maps Axios failures to structured tool errors
    tool-error.ts                Structured error shape + throw helper
    types.generated.ts          Generated from packages/api/swagger/openapi_pet_store.json
config/
  env.ts                        zod-validated environment schema
test/
  pet.service.spec.ts           Unit tests (Axios client mocked)
```

See [`packages/mcp/CLAUDE.md`](./CLAUDE.md) for stack-specific conventions, and [`specs/005-mcp-create-pet-tool/`](../../specs/005-mcp-create-pet-tool/) for this feature's spec, plan, and design artifacts.
