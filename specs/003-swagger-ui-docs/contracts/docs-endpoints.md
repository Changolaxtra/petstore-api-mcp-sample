# Contract: Documentation Endpoints

`@nestjs/swagger`'s `SwaggerModule.setup('docs', app, document)` registers three endpoints from
one call. This feature's only code change is what `document` is (see `data-model.md`); the
endpoints themselves are the library's existing, unmodified behavior.

| Endpoint | Method | Response | Notes |
|----------|--------|----------|-------|
| `/docs` | GET | `200`, `text/html` | The interactive Swagger UI page (FR-001, FR-002). Includes an "Authorize" action backed by the committed `api_key` security scheme, letting a user set their API key once and have it attached to every subsequent "Try it out" call (FR-003, FR-004). |
| `/docs-json` | GET | `200`, `application/json` | The exact `OpenAPIObject` served to the UI — i.e. the committed contract with only `servers` overridden (see `data-model.md`). This is what the e2e "no drift" check in `research.md` §7 asserts against. |
| `/docs-yaml` | GET | `200`, `text/yaml` | Same document as `/docs-json`, YAML-encoded. Not specifically exercised by this feature's tests, but comes for free from the same `SwaggerModule.setup()` call. |

## `buildOpenApiDocument()`

A small function (`packages/api/src/docs/build-openapi-document.ts`) that `main.ts` calls once at
boot to produce the `document` passed to `SwaggerModule.setup()`.

```
buildOpenApiDocument(): OpenAPIObject
  reads packages/api/swagger/openapi_pet_store.json from disk
  returns { ...parsed, servers: [{ url: '/' }] }
```

No parameters, no side effects beyond the file read, deterministic given the same file on disk —
which is exactly what makes it unit-testable without booting the Nest app (per `research.md` §7).

## Unaffected surface

Every existing `user`-tag HTTP operation (`createUser`, `loginUser`, `logoutUser`,
`getUserByName`, `updateUser`, `deleteUser`) is unchanged by this feature — see
`specs/002-user-api-key-auth/contracts/user-api.md` for that contract. This feature only adds a
way to *browse and call* those same operations through a UI; it does not add, remove, or reshape
any of them.
