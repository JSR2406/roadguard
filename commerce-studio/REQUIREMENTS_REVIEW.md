# AI Commerce & Sales Studio requirements review

Review basis: `AI_Commerce_Sales_Studio_Complete_Product_Build_Document.docx`, version 1.0, prepared October 21, 2026, compared with the isolated prototype in this directory.

## Executive assessment

The product thesis is coherent, but the document is broader than a safe first release. The prototype intentionally implements only the first trust-building slice: workspace onboarding and business profile defaults. It does **not** claim to provide tenant isolation, production authentication, tax compliance, AI generation, catalogue publishing, quotation arithmetic, or PDF export.

The highest-risk decision is the boundary between a local demo and a multi-tenant SaaS. The next production slice must establish authenticated users, workspace memberships, server-enforced authorization, durable migrations, and audit events before product or customer data is introduced.

## Priority gaps and risks

### P0 — Product boundary and tenant security

- The requirements call for workspaces, memberships, roles, and server/database-enforced tenant isolation (PR-001–PR-003 and §4).
- This prototype stores one demo profile in browser local storage. It is useful for UX discovery only; it is not an authorization boundary or durable persistence layer.
- The next slice must use managed authentication or an equivalent server session model, workspace membership records, database constraints/RLS, and direct API cross-tenant tests.

### P0 — Money and tax semantics are not executable yet

PR-010/PR-011 and §§6.3/15.2 require deterministic quotation arithmetic, but the specification still needs decisions for:

- integer minor units versus decimal storage;
- currency precision and supported currency list;
- line-level and document-level rounding;
- percentage versus fixed discounts;
- tax-inclusive and tax-exclusive formulas;
- tax jurisdiction and tax-code ownership;
- whether quote prices may override saved product prices;
- transactional quote-number allocation.

Do not add AI or PDF output to quotations until these rules exist as pure code with boundary tests.

### P0 — Export is a product-critical dependency but underspecified

PDF export is part of the narrow value loop (§1.2 and PR-008/PR-012), while §9.1 leaves the renderer open. The implementation still needs decisions for page breaks, fonts, images, locale formatting, immutable snapshots, private storage, download authorization, retries, idempotency, and visual regression checks.

Recommended MVP decision: private PDF export from an immutable saved snapshot. Defer public share links until token revocation, expiry, access counting, and document-scoped authorization are tested.

### P1 — AI usefulness and cost controls need measurable gates

PR-006 requires structured, reviewable product-copy drafts, but the document does not yet select a provider/model or define a benchmark for factuality and usefulness. Prompt redaction, retention, model fallback, per-workspace limits, and cost ceilings also need executable policies.

The product must remain fully usable without an AI provider. AI should draft only; it must never write prices, totals, tax values, or approved content without explicit user confirmation.

### P1 — Discovery and launch readiness are mixed together

The document targets multiple segments (§2.3) and a wide 20–2,000-item ICP (§2.4). This is too broad for initial UX validation. Select one segment and one repeated workflow before optimizing catalogue and quotation flows.

Separate four gates:

1. product MVP behavior;
2. security and operational readiness;
3. pilot validation and willingness-to-pay evidence;
4. paid/public launch approval.

### P1 — Scope conflicts to resolve

1. **Shareable catalogues:** PR-008 permits PDF or shareable web output, while §7 places web catalogues in P1 and §22 recommends private exports first. Treat private PDF as MVP; defer public links.
2. **Metering and audit:** PR-016/PR-019 are P1, but §23 still expects rate limits, usage caps, and important event tracking. Implement minimal beta safeguards and audit events without building full billing UI.
3. **India-first versus international:** tax, currency, payments, privacy, and terms depend on the first operating jurisdiction. Choose that jurisdiction before implementation.
4. **Value loop versus foundation:** product → catalogue → quotation → export is the value loop, but auth/workspace/RLS comes first. Label the foundation as a trust gate, not product-value validation.

## Current prototype acceptance boundary

Implemented here:

- workspace onboarding form;
- business profile fields and defaults;
- inline required/email/phone validation;
- supported currency, locale, and tax-preference validation;
- save/update behavior;
- a local product catalog with SKU/category/search/archive behavior;
- a deterministic local quotation builder with integer minor-unit money, snapshots, discount, tax, and local draft persistence;
- a local server-backed authenticated workspace foundation with migrations, owner membership, profile persistence, tenant-scope checks, sessions, and audit events;
- demo storage scoped to an explicit workspace key;
- visible save failure feedback and safe normalization of malformed stored defaults;
- no AI, billing, or external service calls.

Not implemented and intentionally deferred:

- email verification, password reset delivery, OAuth/SSO, MFA, and production session/cookie policy;
- hosted PostgreSQL/Supabase RLS and multi-member workspace administration;
- server-backed product/quote CRUD, customers, catalogues, proposals, or PDFs;
- production tax calculation or compliance;
- AI provider integration, metering, billing, public share links, and team invites.

## Recommended next vertical slices

1. **Productionize the authenticated workspace foundation:** email verification, password reset, secure cookies, rate limits, CSRF/origin policy, hosted database/RLS, and team membership administration.
2. **Server-backed product and quote CRUD for one selected customer segment:** migrate the local slices to authenticated persistence and server validation.
3. **Private immutable PDF export:** saved document snapshots, authorization, retryable export jobs, and visual regression fixtures.
4. **Optional AI copy drafting:** structured output, fact-preserving validation, provider failure handling, quotas, and human approval.

## Launch blockers

The product is not ready for production or paid launch until tenant isolation, financial calculations, export snapshots, privacy/retention, provider cost controls, support behavior, and pilot evidence are validated. This prototype is a local UX slice, not a SaaS compliance or commercial-readiness claim.
