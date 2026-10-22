# Implementation Plan: Deterministic quotation slice

## Overview

Build the highest-value local limitation after onboarding and product CRUD: a deterministic quotation workflow. The slice will turn saved local products into a reviewable quote draft, calculate money without binary floating-point arithmetic, persist the quote under the active demo workspace, and make the rules explicit enough to migrate later to a server-backed domain service.

This is still a browser-only prototype. It will not claim production tax compliance, tenant isolation, payment collection, PDF generation, or immutable server snapshots.

## Architecture decisions

- Store money as integer minor units for the supported two-decimal currencies; never use JavaScript floating-point values for totals.
- Use a pure quote calculator with explicit rounding, quantity, percentage discount, and tax-rate rules.
- Require every quote line to use the workspace currency; reject mixed-currency inputs.
- Preserve product values in quote-line snapshots so later local product edits do not silently change an existing draft.
- Keep tax calculation limited to a configurable percentage rate and an explicit tax-inclusive/exclusive mode; jurisdiction-specific compliance remains deferred.
- Persist quotes under the active demo workspace key, separate from the product key.

## Acceptance criteria

- A user with a saved workspace can select active products, set quantities, apply a percentage discount and tax rate, and see subtotal, discount, tax, and grand total.
- Calculations use integer minor units with documented half-up rounding and produce deterministic results for boundary values.
- The quote cannot be saved with no lines, invalid quantities/rates, or a currency mismatch.
- Saved quote lines retain product name, SKU, unit price, and currency snapshots.
- A saved quote can be loaded after a remount/reload from the workspace-scoped local key.
- Tests cover quantity multiplication, discount rounding, tax-inclusive/exclusive behavior, invalid inputs, mixed currencies, and persistence.

## Task list

### Phase 1: Money and domain foundation

- [x] Define quote types, money representation, and explicit calculation rules.
- [x] Implement pure quote calculation and validation helpers.
- [x] Add focused tests for financial boundaries and persistence normalization.

### Checkpoint: calculation foundation

- [x] All quote-domain tests pass.
- [x] Typecheck passes.

### Phase 2: User-facing quote workflow

- [x] Add quote builder UI below the local product catalog.
- [x] Allow product selection, quantities, discount/tax controls, preview totals, save, and reload.
- [x] Show clear invalid-state and empty-state feedback.

### Checkpoint: usable local flow

- [x] A profile can be saved, products added, then a quote saved and reloaded.
- [x] Production build succeeds.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Rounding differs from future tax/provider rules | High | Keep the calculator pure and document the exact half-up rules; add boundary tests before server migration. |
| Local storage is not a tenant/security boundary | High | Keep explicit demo labels and workspace keys; do not present it as SaaS authorization. |
| Changing workspace currency after products exist can create mixed data | High | Quote calculator rejects mixed currencies; production must make currency immutable or require a migration workflow. |
| Tax percentage is not legal tax compliance | High | Label tax as a prototype rate; defer jurisdiction, tax codes, exemptions, and compliance review. |
| Quote persistence is mutable local JSON | Medium | Snapshot quote-line values on save and document server-side immutable versions as the next step. |

## Open questions deferred from the supplied requirements

- First operating jurisdiction and tax provider/rules.
- Supported currency precision beyond the current two-decimal demo set.
- Server-side quote numbering and concurrency behavior.
- PDF renderer, private storage, signed downloads, and document versioning.
- Authenticated workspace/membership model and database migrations.

---

# Implementation Plan: Authenticated workspace foundation

## Scope

Replace the browser-only onboarding boundary with a local, server-backed foundation that can be exercised without a cloud account. The server will use Node 24's built-in SQLite support, checked-in SQL migrations, password hashing, opaque expiring sessions, workspace membership, business-profile persistence, and append-only audit events.

The existing local demo remains available; the new server flow is explicitly labeled as a local prototype and is not production auth/compliance.

## Acceptance criteria

- A user can register with an email/password and create one workspace with an owner membership.
- A user can log in, retrieve the current session/workspace profile, update the profile, and log out.
- Passwords are never stored in plaintext; sessions store only hashed opaque tokens and expire.
- Direct API requests without a valid session receive `401`.
- A user cannot read or update another workspace's profile by changing workspace identifiers.
- Migrations run against a blank SQLite database and create users, workspaces, memberships, profiles, sessions, and audit events.
- Profile updates create audit events without storing passwords or session tokens.
- The frontend can switch from local onboarding to the server foundation and show clear auth/error states.

## Files likely touched

- `server/index.mjs`
- `server/migrations/001_foundation.sql`
- `tests/server.test.mjs`
- `src/ServerWorkspace.tsx`
- `src/main.tsx`
- `src/styles.css`
- `package.json`

## Deferred

- Email verification and password reset delivery.
- OAuth/SSO, MFA, session revocation UI, rate limiting, CSRF/origin policy, production secrets, HTTPS, and hosted Postgres/RLS.
- Team invitations beyond the owner membership.

## Completion checkpoint

- [x] SQLite migrations and server routes implemented.
- [x] Password hashing, token hashing, expiry, logout, and audit safety tested.
- [x] Cross-tenant read/write attempts rejected.
- [x] Server foundation UI connected through the Vite `/api` proxy.
- [x] Node 24 server tests, client tests, typecheck, and production build pass.
