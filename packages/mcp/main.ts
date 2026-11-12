import 'reflect-metadata';
import { createHTTPServer } from '@leanmcp/core';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  // Auto-discovers services (one `index.ts` per tool group) from ./mcp —
  // see packages/mcp/CLAUDE.md. Streamable HTTP at /mcp is what MCP
  // Inspector, Claude, and other MCP-compatible agents connect to.
  await createHTTPServer({
    name: 'petstore-mcp',
    version: '0.1.0',
    port: env.PORT,
    cors: true,
    logging: true,
  });
}

bootstrap();
