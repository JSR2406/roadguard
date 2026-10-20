# Self-hosted pilot deployment

**Release status: local pilot software tested; production road-safety deployment blocked.** The Docker image build, Compose configuration, container startup and `/healthz` smoke check are verified. External TLS deployment, restore inside a container, sustained load and road-safety validation are not claimed.

The production build and real Node/SQLite server do run locally. The server serves the frontend and API on the same origin. It is single-process/single-node and supports only the three explicit demo road segments. This is not a city-wide service or live navigation system.

## 1. Prerequisites

- Node **24.14.1**, npm, Python 3.11 for optional offline video tests.
- Docker Desktop/Engine with Compose, running Linux containers.
- A private credential JSON outside source control; a persistent local-disk Docker volume; restricted administrator access.
- For any external access: a TLS reverse proxy, exact public origin, firewall, approved domain/certificate and an operational owner. Default Compose publishes to **127.0.0.1 only**. Do not casually change this to 0.0.0.0 or expose the plain HTTP API.

## 2. Verify software first

From `roadguard/`:

```sh
npm ci
npm test
npm run test:ui
npm run typecheck
npm run build
npm audit
```

No lint script is configured. Dependency audit is a point-in-time advisory check, not a security audit. `node:sqlite` is experimental in the pinned Node release; evaluate that runtime dependency in your deployment policy.

## 3. Provision credentials privately

From the repository root on a clean Linux machine, create the ignored secret directory, then run:

```sh
mkdir -p secrets
npm run provision -- --output ./secrets/roadguard-auth.json
```

The generator refuses to overwrite, creates 256-bit random tokens for reader, authority and three source identities, and never prints them. Restrict Unix permissions/Windows ACLs and grant container UID 1000 read access to the secret as needed. Provision each physical source separately. Do not send credentials through chat, store them in the frontend, or commit them. Open the private file locally only when distributing a role-scoped token to its intended operator/device.

Configuration shape is `{ "credentials": [...] }`; each entry has `role` and `token`, and source entries additionally have `sourceId` and `sourceType` (`dashcam` or `cctv`). Tokens must be at least 32 characters, without whitespace, with sufficient character diversity. Arbitrary user-selected source IDs are not accepted by authenticated ingestion.

For rotation/revocation, replace the private configuration and restart the single process. There is no hot reload, user account service, SSO, or automated device enrolment. Never put a source token and authority token on the same physical camera.

## 4. Prepare Compose

Create a host-local `.env` using `.env.example` as a template. Set:

- `ROADGUARD_AUTH_FILE`: relative or host-appropriate path to the private JSON. The portable `.env.example` uses `./secrets/roadguard-auth.json`.
- `ROADGUARD_ORIGIN`: exact browser origin, initially `http://localhost:8080`; for a TLS reverse proxy use `https://your-approved-domain.example` without a trailing slash.
- `ROADGUARD_PORT`: local published port, default 8080.
- Optional `ROADGUARD_MATCHER_MODULE`: absolute/path-relative ESM module exporting `matcher`, default matcher, or async `createMatcher()` with `resolve(gps, routeRef)`. Use a licensed, versioned production matcher; if omitted, camera ingestion fails closed with 503.
- `ROADGUARD_REGION`: defaults to `Pune/Pimpri-Chinchwad`; readiness metadata only.
- `ROADGUARD_CORRIDOR`: defaults to `UNSELECTED`; replace only after corridor approval and route-graph setup.

Then:

```sh
docker info
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

The image uses non-root Node, no runtime npm dependencies, a read-only root filesystem, dropped Linux capabilities, bounded memory/processes, restricted loopback publishing, a health check and a named data volume. A local build and health check were verified with the documented flow; use a free host port if `8080` is already occupied.

The video toolchain is deliberately not bundled in the API image. Run it offline or build a separately reviewed inference worker. The API does not download arbitrary footage or execute model uploads.

## 5. Non-Docker local start

After building the frontend, set process environment variables and run `npm start`:

- `ROADGUARD_AUTH_FILE`: existing private JSON file.
- `ROADGUARD_DB_PATH`: writable private SQLite path (not `:memory:`).
- `ROADGUARD_ALLOWED_ORIGIN`: `http://localhost:8080` for local browser mutation requests.
- `HOST`: `127.0.0.1` for a local-only pilot.
- `PORT`: `8080`.

Unix shell example (replace paths):

```sh
ROADGUARD_AUTH_FILE=./secrets/roadguard-auth.json ROADGUARD_DB_PATH=./data/roadguard.sqlite ROADGUARD_ALLOWED_ORIGIN=http://localhost:8080 HOST=127.0.0.1 PORT=8080 npm start
```

Open http://localhost:8080 and choose **Server workspace**. Enter role tokens directly in the local page; they are held in memory only and cleared on disconnect or mode switch. Demo evidence is never uploaded automatically. The Vite-only preview at port 5173 serves synthetic mode but has no API proxy; use port 8080 for the server workspace.

## 6. Verify deployed behavior

- `/healthz`: 200; `/api/readiness`: 200 with `roadSafetyValidated: false`.
- Authenticated `/api/metrics`: operational counters only; it does not prove safety or replace external monitoring.
- Unauthenticated `/api/hazards`: 401. The HTML application is public; server evidence is not.
- Reader can view but cannot ingest or request response; source can ingest only with its bound identity; authority can request response but cannot invent camera observations.
- Submit one enrolled source report, then repeat it: no duplicate verification. A distinct observation from an independent physical camera can corroborate. Do not replay the same video under another device ID.
- Restart and verify evidence/audit receipts survive.
- Check wrong-route exclusion, animal expiry, night/rider thresholds and explicit-clear resolution rules.
- Exercise network loss: show degraded state, clear old computed alerts, do not infer a safe road.
- Exercise `POST /integration/camera/observations` with the injected matcher in an integration environment. Without a matcher the endpoint must fail closed with 503. Verify per-record receipts, source identity, duplicate frames, stale GPS and bounded NDJSON.

`tests/api.test.ts` and the UI real-server integration test cover these core software boundaries locally. They do not replace testing your actual container, reverse proxy, network, cameras or vehicles.

## 7. Backups, restore and operations

Use the included online SQLite backup utility; copying only a live `.sqlite` file can miss WAL data:

```sh
mkdir -p backups
node server/backup.mjs --database ./data/roadguard.sqlite --output ./backups/new-snapshot.sqlite
```

It refuses overwrite and checks snapshot integrity. For container use, mount an explicitly authorised backup directory or execute this through a controlled maintenance workflow. Scheduling, off-host encryption and retention are operator decisions; none is installed automatically.

Restore on a **stopped** service into a clean data directory/volume with correct ownership; preserve the original backup; do not mix an old main database with stale WAL/SHM files. Start the service, run `PRAGMA integrity_check` through an authorised SQLite tool, verify hazard count/event cursor and perform a read-only API check before allowing writers. The automated backup test verifies committed WAL data and a fresh SQLite restore; full container disaster recovery still requires an operator drill.

Monitor process health, storage capacity, backup age, HTTP error/rejection rates, event backlog, camera coverage and evidence age. Histories/replay receipts are append-only and stored snapshots contain growing observation arrays. **Compaction/retention, sustained-load tests and disk-exhaustion handling are required before long-running production operation.** No HA, multi-worker SQLite sharing, automatic schema migration or fleet-wide latency SLA is claimed. Keep scale limited and stop ingestion before storage exhaustion.

## 8. Release blockers

See `reports/validation-report.md`. Required outstanding inputs include permitted trained model weights and independently labelled local footage, calibrated physical camera positioning, road graph/GPS integration, camera feed permissions, real-device delivery testing, Docker runtime verification, TLS deployment, retention/load testing and a qualified closed-track safety review. Passing software tests does not override these gates.
