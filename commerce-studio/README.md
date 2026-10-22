# Commerce Studio prototype

This is an **isolated AI Commerce & Sales Studio vertical slice** for workspace onboarding and business profile setup. It lives under `roadguard/commerce-studio/` so it can be explored without changing RoadGuard's existing source, tests, or package files.

## What is included

- Landing/onboarding screen with a compact Commerce Studio product frame.
- Workspace name, business display name, legal name, address, email, phone, default currency, locale, and tax preference.
- Required-field, email, and phone validation with inline errors.
- Supported currency, locale, and tax-preference validation with safe normalization of malformed stored defaults.
- Save and update behavior in the browser using a typed local-storage adapter.
- User-visible feedback when browser storage is unavailable or a save fails.
- Local product catalog slice with name, SKU, category, description, workspace-currency price, search, and archive behavior.
- Deterministic local quotation builder with product snapshots, integer minor-unit money, quantity, percentage discount, tax-inclusive/exclusive modes, and saved quote drafts.
- Local server-backed workspace foundation with SQLite migrations, registration/login/logout, hashed passwords, expiring in-memory sessions, owner membership, profile persistence, tenant-scope checks, and audit events.
- Explicit tenant-safe demo boundary: only the active profile for `demo-commerce-workspace` is stored under `commerce-studio:workspace-profile:<workspace-id>`.
- No AI calls, billing behavior, external services, secrets, or credentials.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL printed by the command. The browser-local demo works by itself. To use the **Server foundation** mode, run the API in a second terminal with Node 24.14.1:

```bash
npm run server
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000`. The production build is generated in `dist/`:

```bash
npm run typecheck
npm test
npm run build
npm run test:server
```

## Deferred risks and follow-up work

This prototype now includes a local server-backed authentication/workspace foundation, but it is not production authentication. Before production use, it still needs email verification, password reset delivery, rate limiting, CSRF/origin policy, secure cookie/session strategy, HTTPS, secret management, hosted Postgres/RLS, membership administration, durable backup/retention, and privacy review. AI actions, billing, PDF/share export, catalog publishing, orders, and customer data are intentionally out of scope here.

See [`REQUIREMENTS_REVIEW.md`](./REQUIREMENTS_REVIEW.md) for the prioritized gaps, requirement conflicts, launch blockers, and recommended next vertical slices from the supplied product build document.
