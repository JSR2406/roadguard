# RoadGuard — pothole and animal-hazard pilot

RoadGuard now includes a synthetic dashboard, animal/night-aware hazard engine, authenticated persistent Node/SQLite API, separate server-backed UI, reproducible video experiments and Docker/self-hosting configuration.

**Status: reproducible software pilot, NOT production road-safety ready.** No real dashcam, CCTV, GPS or trained model weights are connected. Synthetic success must not be represented as model accuracy or road-safety certification.

## Clean-machine submission checklist

- Git repository with commits: this project is published with a `main` branch.
- Dependency lockfile: `package-lock.json` is committed; use `npm ci`.
- Runtime pinned: `.nvmrc`, `package.json` `engines`, and the Dockerfile all pin Node `24.14.1`.
- Container workflow: `Dockerfile` builds the frontend and runs the Node/SQLite server; Compose supplies the private auth secret and persistent volume. The image build and `/healthz` smoke run have been verified with Docker.
- One test command: `npm test` runs the complete Node test suite. The optional UI suite is `npm run test:ui`.
- Setup/run/test documentation: the commands below and `docs/deployment.md` are portable Linux/macOS instructions.
- Configuration only in `.env.example`: no credentials are committed; `secrets/`, `.env`, databases and generated data are ignored.
- Portable paths: repository commands use relative paths; replace only deployment-host paths when mounting private secrets or backups.

## Open locally

Synthetic preview: http://localhost:5173 (when Vite is running).

The built frontend and persistent server have also been started locally at http://localhost:8080. Use **Synthetic demo** without credentials, or **Server workspace** for the isolated authenticated store. Server evidence starts empty. Do not paste credentials into chat.

```sh
nvm install 24.14.1
nvm use 24.14.1
npm ci
npm run dev -- --port 5173
```

Requires Node **24.14.1** for the backend's built-in SQLite/TypeScript support. A Vite-only preview has no backend proxy. Follow [deployment instructions](docs/deployment.md) to provision private credentials and start the persistent server or Docker environment.

## Clean Linux setup and run

The following commands assume a fresh checkout and a running Docker Engine. They use only repository-relative paths and do not place secrets in Git:

```sh
cp .env.example .env
mkdir -p secrets
npm run provision -- --output ./secrets/roadguard-auth.json
npm test
npm run build
docker compose --env-file .env config --quiet
docker compose --env-file .env up --build -d
curl --fail http://127.0.0.1:8080/healthz
```

Open `http://localhost:8080` for the server-backed workspace. For the browser-only synthetic preview, run `npm run dev -- --host 127.0.0.1 --port 5173` instead. To stop the container, run `docker compose --env-file .env down`.

## What is implemented

- Independent-source, type-isolated evidence fusion; source-bound authenticated ingestion and durable replay protection.
- Pothole, animal-on-road and possible animal-incident categories. Animal incidents mean **review required**, not injury/death or confirmed collision classification.
- Adaptive 100–500 m advisory thresholds, directed-route relevance, two-wheeler bonus and night bonus. Policy constants remain unvalidated engineering hypotheses.
- Mobile animal report expiry at 60 s; possible incident expiry at 5 min; 30 s animal corroboration window. Expiry means unknown, not cleared.
- Response/repair requests and independent explicit-clear verification; recurrence starts a new evidence episode.
- Dashboard evidence inspection, sorting/filtering, manual controls, persisted synthetic state and same-browser cross-tab demonstration.
- Separate server workspace with in-memory-only role tokens, real API evidence submission, authority response and server-side route checks. Synthetic evidence is not silently published.
- Hindi/English presentation switch with persisted non-sensitive language preference and accessible labels. Backend/model payloads remain canonical and are not translated.
- Browser GPS watch and OpenStreetMap position-link preview are available in the server workspace; browser camera enumeration is a capability check only, not vehicle-camera access.
- SQLite transactions, append-only event cursor, quality-rejection receipts, role checks, bounded HTTP requests/rate limits, origin checks, safe static serving, security headers, graceful shutdown and online backup utility.
- Authenticated NDJSON camera/GPS ingestion endpoint with injected route-matcher boundary, duplicate-frame handling and safe operational metrics (`/api/metrics`).
- Dockerfile and hardened loopback-only Compose configuration. Container build and health-check smoke run are verified; production TLS, retention and load gates remain separate.

## Try the synthetic workflow

1. **Reset demo** to get fresh pothole and animal examples (legacy stored evidence may have only four potholes).
2. Inspect source history. Change route, vehicle position, speed, two-wheeler mode and vehicle lighting.
3. Add repeated reports from the same source: they cannot supply independent corroboration. Select another genuinely independent source only for a synthetic second-camera scenario, never to disguise replayed footage.
4. Request repair/response on a verified active hazard. Submit two fresh explicit-clear reports from different sources after the request. One report, no detection or a request alone cannot close it.
5. Reload to retain synthetic evidence. Another same-origin tab can receive storage events, but that is not physical V2V or a multi-user database.

## Video experiments

Use the existing local environment on this Windows workspace, or create a new environment using `vision/README.md`:

```powershell
vision/.venv/Scripts/python.exe -m pytest vision/tests -q
vision/.venv/Scripts/python.exe -m vision generate
vision/.venv/Scripts/python.exe -m vision evaluate
vision/.venv/Scripts/python.exe -m vision.report
npm run test:pipeline
```

On Linux/macOS use `vision/.venv/bin/python`. Eight original procedural day/night videos contain potholes, animals, clean-road negatives and hard negatives. The evaluated detector is a transparent **synthetic color/shape baseline, not trained AI**. A fail-closed optional ONNX adapter is available for permitted trained weights; its preprocessing is unit-tested, but no trained model was executed here.

**Measured fixture result:** 192 frames, 96 TP, 3 FP, 0 FN; precision 96.97%, recall 100%. All three false positives are night hard negatives. Reduced-brightness drawings do not validate night-time road detection. See the portable [simulation evidence gallery](reports/simulation-preview.html), including an actual false-positive overlay.

## Verification

```sh
npm test
npm run test:ui
npm run typecheck
npm run build
npm audit
```

The UI tests exercise real React interactions, reload/storage-event behavior and a real ephemeral HTTP/SQLite server with restart persistence. They are jsdom tests, not full browser-layout or physical-device tests. No lint command is configured.

Current results and production blockers: **[reports/validation-report.md](reports/validation-report.md)**.

## Key deliverables

- `docs/deployment.md`: local/Docker setup, secrets, TLS boundary, backup and release gates.
- `docs/market-launch-checklist.md`: evidence required before a paid/public-road launch.
- `docs/pune-pilot-data-and-maps.md`: Pune/Pimpri-Chinchwad datasets, licences, local capture plan and map-provider comparison.
- `docs/dataset-and-simulation-plan.md`: RDD2022/COCO/BDD100K roles, recorded replay, CARLA, SUMO and scenario acceptance matrix.
- `pilot/README.md`: local capture, annotation, review-queue and calibration workflow for the Pune pilot.
- `pilot/data/`: first local dataset registry/templates; currently zero captures and zero annotations until permitted Pune footage is supplied.
- `pilot/external-footage/`: provenance/attribution for one openly licensed external fog-road smoke-test clip; not Pune data and not an accuracy benchmark.
- `docs/validation-and-reuse.md`: original feasibility, component licensing and production architecture.
- `reports/validation-report.md`: actual checks, issues found/fixed and unpassed gates.
- `reports/video-results.json`: stable synthetic evaluation summary.
- `reports/pipeline-results.json`: actual synthetic detector → authenticated API → route-warning smoke result.
- `reports/simulation-preview.html`: portable visual evidence including a failure example.
- `vision/README.md`: video dataset generation, evaluation, model adapter and proposal limitations.

Before real-road deployment, provide permitted model weights/local labelled footage, calibrate physical cameras, replace fixed road IDs with real route/GPS matching, validate network lead times and rider distraction, complete Docker/TLS/load/retention checks, and obtain qualified safety/authority approval. This repository does not automate emergency reporting or vehicle control.
