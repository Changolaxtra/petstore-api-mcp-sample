# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/mcp/package.json packages/mcp/
RUN npm ci
COPY packages/mcp packages/mcp
RUN npm run build --workspace packages/mcp

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/mcp/package.json packages/mcp/
RUN npm ci --omit=dev
COPY --from=build /workspace/packages/mcp/dist packages/mcp/dist
WORKDIR /workspace/packages/mcp
EXPOSE 3001
CMD ["node", "dist/main.js"]
