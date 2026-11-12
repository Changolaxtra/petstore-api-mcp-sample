# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/api/package.json packages/api/
RUN npm ci
COPY packages/api packages/api
RUN npm run build --workspace packages/api

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/api/package.json packages/api/
RUN npm ci --omit=dev
COPY --from=build /workspace/packages/api/dist packages/api/dist
WORKDIR /workspace/packages/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
