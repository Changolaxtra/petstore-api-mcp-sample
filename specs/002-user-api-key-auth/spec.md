# Feature Specification: User Account Operations & API Key Authentication

**Feature Branch**: `002-user-api-key-auth`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Scaffold the api package, lets implement the user api operations (controller, service, repository), also we need to consider the security part, the api uses "api-key" as auth mechanism lets use valkey (another docker container) to store the api key with a TTL of 30 min, passwords are stored hashed, under Readme.md document and add the a test user with password to db, it does not matter since is non a prod project."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authenticate and receive an API key (Priority: P1)

A registered user signs in with their username and password and, on success, receives an API
key. That key is what the user presents on every subsequent request to prove who they are,
instead of sending credentials again.

**Why this priority**: Nothing else in this feature is reachable without authentication working
first — it is the gate every other user operation sits behind.

**Independent Test**: Can be fully tested by submitting valid credentials for an existing account
and confirming an API key is returned, and by submitting invalid credentials and confirming
authentication is refused. Delivers standalone value: a working login flow.

**Acceptance Scenarios**:

1. **Given** a registered user with a known username and password, **When** they submit those
   credentials to sign in, **Then** they receive an API key they can use for later requests.
2. **Given** a registered user, **When** they submit the correct username with an incorrect
   password, **Then** sign-in is refused and no API key is issued.
3. **Given** no account exists for a submitted username, **When** sign-in is attempted, **Then**
   it is refused with the same kind of response as a wrong password (no hint about which field was
   wrong).

---

### User Story 2 - Manage a user account (Priority: P2)

A new user account can be created, and an existing account's profile can be looked up, updated,
or removed — mirroring the standard account lifecycle operations of the pet store's user domain.

**Why this priority**: Account management is the data this feature revolves around, but it only
becomes meaningful once sign-in (User Story 1) exists to protect it.

**Independent Test**: Can be fully tested by creating a new account, fetching it back by
username, updating one of its fields, and then deleting it — independent of any other user's
data.

**Acceptance Scenarios**:

1. **Given** a username that is not already taken, **When** a new account is created with that
   username, an email, and a password, **Then** the account exists and can be retrieved by
   username afterward.
2. **Given** a username that is already taken, **When** account creation is attempted again with
   that same username, **Then** creation is refused.
3. **Given** an existing account, **When** its profile fields (e.g., email, name, phone) are
   updated, **Then** a subsequent lookup reflects the new values.
4. **Given** an existing account, **When** it is deleted, **Then** it can no longer be retrieved,
   authenticated against, or updated.

---

### User Story 3 - End a session / let it expire (Priority: P3)

A signed-in user can explicitly end their session (sign out), which immediately invalidates their
API key. If they take no action, the API key stops working on its own after a bounded period of
time.

**Why this priority**: This closes the security loop opened by User Story 1 — important for a
trustworthy auth mechanism, but the system is still usable end-to-end without it while P1/P2 are
being built.

**Independent Test**: Can be fully tested by signing in, signing out, and confirming the issued
API key no longer grants access; and separately, by signing in and confirming the key stops
working after the defined expiry window without any explicit sign-out.

**Acceptance Scenarios**:

1. **Given** a user holding a valid API key, **When** they sign out, **Then** that API key is
   immediately rejected on any further request.
2. **Given** a user holding a valid API key, **When** the defined expiry window elapses without
   the key being used to sign out or renewed, **Then** the key is rejected on the next request.

---

### Edge Cases

- What happens when a request to a protected operation carries no API key at all? → Refused, same
  as an invalid/expired one.
- What happens when a request carries an API key that was valid for a now-deleted user account? →
  Refused; a deleted account's keys are no longer honored.
- What happens when a user signs in again while an earlier API key they were issued is still
  valid? → Both keys remain independently valid until each expires or is explicitly signed out of
  (see Assumptions); signing in does not forcibly invalidate other active sessions for that user.
- How does the system handle creating an account with a username differing only in case or
  surrounding whitespace from an existing one? → Treated as the same username (collision), to
  avoid confusingly near-duplicate accounts.
- What happens when someone tries to update or delete a username that doesn't exist? → Refused
  with a clear "not found" outcome, not a silent no-op.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creation of a user account given a unique username, an email
  address, and a password.
- **FR-002**: System MUST reject creation of a user account whose username is already in use.
- **FR-003**: System MUST never persist or expose a user's password in plain text — only a
  verifiable, irreversible representation of it is stored.
- **FR-004**: System MUST let a user authenticate with a username and password and, only on a
  correct match, issue an API key tied to that user.
- **FR-005**: System MUST refuse authentication for an unknown username or an incorrect password
  without revealing which of the two was wrong.
- **FR-006**: System MUST expire every issued API key automatically no later than 30 minutes
  after it was issued.
- **FR-007**: System MUST refuse any protected operation when the request's API key is missing,
  unrecognized, or expired.
- **FR-008**: System MUST let a signed-in user explicitly end their session, immediately
  invalidating the associated API key for any further use.
- **FR-009**: System MUST let an account's profile be retrieved by username.
- **FR-010**: System MUST let an existing account's profile fields be updated.
- **FR-011**: System MUST let an existing account be deleted, after which it can no longer be
  retrieved, authenticated against, or updated, and any API keys previously issued to it stop
  granting access.
- **FR-012**: System MUST document, in human-readable form, how to create an account, how to
  authenticate, and how to use the resulting API key on subsequent requests.
- **FR-013**: System MUST come preloaded with one ready-to-use test account (including its
  password, documented alongside the rest of the setup instructions) so the authentication flow
  can be exercised immediately in a local/development environment.

### Key Entities

- **User Account**: A registered person's record in the pet store system — holds a unique
  username, contact details (email, phone), display name fields, and a password credential
  (never stored or shown in plain text). Owns zero or more active API keys at any given time.
- **API Key (Session)**: A credential issued to a User Account upon successful authentication.
  Tracks which account it belongs to, when it was issued, and when it expires (or that it was
  explicitly ended early). Used on subsequent requests in place of resending the username and
  password.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new account, once created, can be used to sign in and reach a protected operation
  in under 5 seconds end-to-end.
- **SC-002**: An inspection of persisted account data shows zero plain-text passwords, across
  every account including the preloaded test account.
- **SC-003**: An API key that sits unused for the full 30-minute window stops granting access on
  the very next request after that window elapses.
- **SC-004**: After a user explicitly ends their session, 0% of further requests using that same
  API key succeed.
- **SC-005**: A developer following the documented setup can create an account (or use the
  preloaded test account), sign in, and successfully call a protected operation within 10 minutes
  on a freshly started environment.

## Assumptions

- The preloaded test account's password is intentionally documented in plain text in the
  project's README for developer convenience — acceptable because this is explicitly a
  non-production sample project, not because it's a pattern to reuse elsewhere.
- Signing in multiple times for the same account issues a new, independent API key each time;
  earlier keys for that account are not forcibly invalidated by a later sign-in. Only an explicit
  sign-out or natural expiry ends a given key.
- The 30-minute expiry is measured from the moment the API key is issued (a fixed lifetime), not
  reset by ongoing activity, absent any indication that a sliding/idle timeout is required.
- Account creation and sign-in are themselves open operations (no API key required to reach
  them), since a key can only be obtained after an account exists and credentials are verified;
  all other account operations (lookup, update, delete, sign-out) require a valid API key.
- Account profile fields follow the pet store domain's existing conventions (username, first/last
  name, email, phone, password, account status) rather than introducing new fields.
- Password strength rules, email verification, and a self-service password-reset flow are out of
  scope for this feature.
- Rate-limiting of sign-in attempts is out of scope for this feature.
