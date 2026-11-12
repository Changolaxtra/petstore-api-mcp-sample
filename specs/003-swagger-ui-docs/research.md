# Research: Interactive API Documentation (Swagger UI)

## 1. Source of the served document

- **Decision**: Serve the committed `packages/api/swagger/openapi_pet_store.json` directly as
  the Swagger UI document — read from disk and handed to `SwaggerModule.setup()` as a plain
  `OpenAPIObject` — instead of the prior `main.ts`'s `DocumentBuilder` + `SwaggerModule.createDocument(app, config)`, which builds a second document by reflecting over controller decorators.
- **Rationale**: The decorator-built document is a second, independently-derived description of
  the API that can silently diverge from the committed contract (e.g. a new DTO field with no
  matching `@ApiProperty()`), which is exactly the drift spec FR-006 forbids. Reading the
  committed file directly makes the documentation page definitionally unable to drift from it.
- **Alternatives considered**: Keep `DocumentBuilder`/`createDocument` and manually keep
  decorators in sync with the contract — rejected; it reintroduces a second source of truth that
  Constitution Principle I already warns against.

## 2. The `servers` field mismatch

- **Decision**: Override only the document's top-level `servers` array to `[{ url: '/' }]` when
  serving it, leaving every operation, schema, and security scheme from the committed file
  untouched.
- **Rationale**: The committed contract declares `servers: [{ "url": "/api/v3" }]` — inherited
  from the public reference Swagger Petstore spec's own deployment path — but this project's
  NestJS controllers are mounted at the root (e.g. `/user/login`, not `/api/v3/user/login`).
  Served as-is, every "Try it out" call in Swagger UI would 404 against a path the real server
  doesn't expose. Overriding just this one field is the minimal change that makes live testing
  actually work, without touching the committed file or any existing route.
- **Alternatives considered**: (a) Add a global `/api/v3` route prefix to the whole app so it
  matches the contract exactly — rejected for this feature; it's an unrelated, cross-cutting
  change (every existing route, every test, the README, `quickstart.md`) that deserves its own
  deliberate contract-alignment feature if the team wants it, not a side effect of adding a docs
  page. (b) Serve `servers` unmodified and accept broken "Try it out" — rejected; directly
  violates FR-004/FR-005/SC-002.

## 3. No new dependency needed

- **Decision**: Use the already-installed `@nestjs/swagger` package as-is. `SwaggerModule.setup(path, app, document)` accepts any object matching the OpenAPI document shape — it doesn't care
  whether that object came from `DocumentBuilder` or was loaded directly from a file — and it
  already bundles and serves the Swagger UI assets at the given path.
- **Rationale**: Nothing about switching the document's source requires new tooling.
- **Alternatives considered**: A standalone static Swagger UI (e.g. `swagger-ui-dist` copied into
  a public folder and served separately from the app) — rejected; reinvents what `@nestjs/swagger`
  already does integrated with the app's own lifecycle.

## 4. Path for the documentation page

- **Decision**: Keep the existing `/docs` path already wired up in `main.ts` from the prior
  feature, rather than renaming it.
- **Rationale**: FR-001 only requires "a stable, predictable location"; `/docs` already is that,
  is already referenced in the committed `README.md`, and renaming it would be pure churn with no
  functional benefit.
- **Alternatives considered**: None seriously considered — no requirement motivates a change.

## 5. Making the raw contract file available at runtime (Docker)

- **Decision**: Update `packages/api/Dockerfile`'s runtime stage to also `COPY` the
  `packages/api/swagger/` directory, alongside the existing `dist/` copy.
- **Rationale**: Once the document is read from disk at runtime (decision 1) rather than being
  embedded into the compiled output via decorator reflection, the raw JSON file must physically
  exist next to the running process. The current Dockerfile's runtime stage only copies `dist/`,
  which would make `/docs` crash (`ENOENT`) under `docker compose up` while working fine under
  `npm run start:dev` — an inconsistency this feature must close, not leave as a surprise.
- **Alternatives considered**: Bundling the JSON into `dist/` via an extra build step — rejected;
  unnecessary indirection when a one-line `COPY` in the existing multi-stage Dockerfile does the
  same job more simply.

## 6. Resolving the file path in code

- **Decision**: Resolve the contract file's path at runtime with
  `path.join(__dirname, '..', 'swagger', 'openapi_pet_store.json')`, not a static
  `import ... from '....json'`.
- **Rationale**: `packages/api/swagger/` sits outside `src/`'s TypeScript `rootDir`/`include`
  globs (`tsconfig.json` only includes `src/**/*.ts` and `test/**/*.ts`), so a static JSON import
  wouldn't compile cleanly as-is. A `__dirname`-relative read works identically whether the code
  is running from `src/` (dev, via `ts-node`/`nest start`) or `dist/` (compiled), since both sit
  at the same depth under `packages/api/`.
- **Alternatives considered**: Widening `tsconfig.json`'s `include`/`rootDir` to cover `swagger/`
  just to allow a static import — rejected; a larger change to the TypeScript project shape for no
  benefit over a simple runtime file read.

## 7. Verifying "no drift" (FR-006)

- **Decision**: A unit test asserts the function that builds the served document returns the
  committed file's exact content with only `servers` overridden (a direct structural comparison
  against the real file on disk, not a hand-copied expected value). Separately, the existing
  `user.e2e-spec.ts` — which already boots the full app against real `testcontainers` Postgres
  and Valkey instances — gains two more assertions: `GET /docs` returns `200` with an HTML body,
  and `GET /docs-json` returns `200` with the expected document.
- **Rationale**: Comparing against the real file on disk is what makes the test itself unable to
  drift from the contract the same way the feature is designed not to. Reusing the already-running
  app in `user.e2e-spec.ts` avoids paying container-startup cost twice for a check that touches
  neither the database nor Valkey.
- **Alternatives considered**: A dedicated `docs.e2e-spec.ts` with its own `testcontainers` setup
  — rejected as unnecessary duplication of container startup cost at this project's scale.

All Technical Context items are resolved above; no `NEEDS CLARIFICATION` markers remain.
