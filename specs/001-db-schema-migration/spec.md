# Feature Specification: Petstore Database Schema Migration

**Feature Branch**: `001-db-schema-migration`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "We have a swagger definition, based on it I want to create the DB schema, liquibase is supported, this will be the first migration file. under /api/architecture create a mermaid entity-relationship diagram with result"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up the persistence layer from the published contract (Priority: P1)

A backend developer implementing the Petstore API needs a relational database schema that faithfully represents every entity in the published OpenAPI contract (pets, categories, tags, orders, users), delivered as the project's first Liquibase migration, so that API endpoints have somewhere real to read from and write to.

**Why this priority**: Nothing else in the API can be built — no controller, service, or repository — until the data each endpoint reads and writes actually exists as tables. This is the foundation every later feature depends on.

**Independent Test**: Can be fully tested by applying the migration to an empty PostgreSQL database and confirming a table (or association table) exists for every entity defined in `openapi_pet_store.json`, with columns matching that entity's fields and types.

**Acceptance Scenarios**:

1. **Given** an empty, freshly-created PostgreSQL database, **When** the first migration is applied, **Then** tables exist covering Pet, Category, Tag, the Pet-to-Tag association, Pet photo URLs, Order, and User, with each column's data type and nullability matching the corresponding field in the OpenAPI contract.
2. **Given** a database the migration has already been applied to, **When** the same migration is applied again, **Then** it completes without error and does not create duplicate tables, columns, or constraints.
3. **Given** the schema is applied, **When** a Pet, Category, Tag, Order, or User record is inserted with all contract-required fields populated, **Then** the insert succeeds and the record can be read back unchanged.

---

### User Story 2 - Understand the data model at a glance (Priority: P2)

A developer or reviewer who did not write the migration needs a visual map of how Pets, Categories, Tags, Orders, and Users relate to one another, so they can reason about the data model without reverse-engineering it from raw migration SQL.

**Why this priority**: Speeds up onboarding and code review and reduces the chance that someone introduces a change inconsistent with the existing model — valuable, but the schema is usable without it.

**Independent Test**: Can be fully tested by opening the delivered diagram file in a Mermaid-compatible viewer and confirming every table and relationship present in the schema also appears in the diagram, with cardinality shown.

**Acceptance Scenarios**:

1. **Given** the schema migration has been written, **When** the entity-relationship diagram is produced, **Then** it is stored under the API package's architecture documentation and lists every table from the migration along with its key attributes.
2. **Given** the diagram, **When** a reviewer inspects a relationship line (e.g., Pet to Order, Pet to Tag), **Then** the cardinality of that relationship (one-to-many, many-to-many, optional-to-one) matches what the migration actually enforces.

---

### User Story 3 - Trust the data even if the API has a bug (Priority: P3)

A reviewer wants invalid states — such as a pet or order with a status value that doesn't exist in the contract — to be impossible to persist, even if a future application-layer bug fails to validate them first.

**Why this priority**: Defense-in-depth data integrity. It materially reduces the blast radius of future bugs but is not required for the first endpoints to function.

**Independent Test**: Can be fully tested by attempting to insert a Pet or Order row with a status value outside the contract's allowed set and confirming the database itself rejects it.

**Acceptance Scenarios**:

1. **Given** the schema is applied, **When** an insert or update sets a Pet's status to a value other than `available`, `pending`, or `sold`, **Then** the database rejects the write.
2. **Given** the schema is applied, **When** an insert or update sets an Order's status to a value other than `placed`, `approved`, or `delivered`, **Then** the database rejects the write.

---

### Edge Cases

- What happens when someone tries to delete a Pet that still has existing Orders referencing it? The deletion must be blocked rather than silently orphaning or cascading away historical order data.
- What happens when someone tries to delete a Category or Tag that is still referenced by one or more Pets? The reference must be handled explicitly (blocked or cleanly detached) rather than left dangling.
- What happens when a Pet is created with an empty photo URL list? The contract marks the photo URL collection as required but does not require it to be non-empty, so an empty collection must be accepted, not rejected.
- What happens when two Categories or two Tags are created with the identical name? Reference data of this kind is expected to be unique by name to avoid ambiguous groupings.
- What happens when a Pet is created without a Category? The contract does not require a Category, so the association must be optional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The schema MUST provide a persisted representation of every core entity defined in the OpenAPI contract: Pet, Category, Tag, Order, and User.
- **FR-002**: The schema MUST represent the many-to-many relationship between Pet and Tag through an association, not by duplicating tag data per pet.
- **FR-003**: The schema MUST represent a Pet's photo URLs as an ordered collection of strings per pet, supporting zero or more URLs per pet.
- **FR-004**: The schema MUST associate each Pet with at most one Category, and that association MUST be optional.
- **FR-005**: The schema MUST associate each Order with exactly one Pet.
- **FR-006**: The schema MUST restrict a Pet's status to the contract-defined values (`available`, `pending`, `sold`) and reject any other value.
- **FR-007**: The schema MUST restrict an Order's status to the contract-defined values (`placed`, `approved`, `delivered`) and reject any other value.
- **FR-008**: The schema MUST enforce that each User is uniquely identifiable by username, consistent with the contract's username-based user lookup.
- **FR-009**: The schema MUST be delivered as the first migration in the project's migration history, and that migration MUST be safe to apply repeatedly against the same database without error or duplication.
- **FR-010**: The project MUST provide an entity-relationship diagram, in Mermaid format, located in the API package's architecture documentation, that reflects every table and relationship introduced by the migration.
- **FR-011**: The schema MUST prevent deletion of a Pet that still has Orders referencing it.
- **FR-012**: Category and Tag names MUST be unique.
- **FR-013**: The migration files MUST live in a dedicated migrations folder inside the API package itself, not at the repository root or in any shared/top-level location.

### Key Entities

- **Pet**: The core adoptable/sellable item. Has a name, an ordered list of photo URLs, a status (`available`/`pending`/`sold`), an optional Category, and zero or more Tags.
- **Category**: A single classification a Pet can belong to (e.g., "Dogs"). Identified uniquely by name; many Pets may share one Category.
- **Tag**: A free-form label a Pet can carry (e.g., "friendly"). Identified uniquely by name; a Pet may carry many Tags, and a Tag may apply to many Pets.
- **Order**: A purchase/reservation of a specific Pet, with a quantity, ship date, status (`placed`/`approved`/`delivered`), and a completion flag. Always tied to exactly one Pet.
- **User**: An account holder, identified uniquely by username, with contact details and an account status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can take a brand-new, empty database and have all five business entities (Pet, Category, Tag, Order, User) ready to use after a single migration step, with no manual follow-up steps.
- **SC-002**: Re-running the migration against an already-migrated database produces zero errors and zero duplicate structures, 100% of the time.
- **SC-003**: Every table and relationship present in the applied schema is also visible in the entity-relationship diagram — a side-by-side review finds no gaps in either direction.
- **SC-004**: 100% of attempts to store a Pet or Order with a status value outside the contract-defined set are rejected before the invalid data reaches storage.
- **SC-005**: A reviewer unfamiliar with the migration can correctly describe how any two related entities (e.g., Pet and Order, Pet and Tag) connect, using only the diagram, without opening the migration file.

## Assumptions

- The OpenAPI contract at `packages/api/swagger/openapi_pet_store.json` is the authoritative source for which entities, fields, and enumerated values this schema must support.
- Each entity's existing numeric `id` field from the contract is used as that entity's primary key; no separate surrogate identifier is introduced.
- Record creation/update timestamps are added to each table as standard auditing fields, even though the contract does not model them explicitly, since this is standard practice for any persisted entity.
- Deleting a Category or Tag that is still referenced by Pets detaches the association rather than deleting the Pet; deleting a Pet that still has Orders is blocked outright (see Edge Cases).
- "Under `/api/architecture`" refers to a new `architecture/` directory inside the `packages/api` package, since the API package itself owns the schema this diagram documents.
- The migrations folder sits at `packages/api/migrations/`, alongside the package's own source and swagger contract, consistent with FR-013.
- This feature covers only the schema and its diagram — it does not cover the repository/service code that will query this schema, which is expected to follow in a later feature.
