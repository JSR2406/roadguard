# RoadGuard validation and release report

Date: 18 October 2026. Environment: Windows, Node 24.14.1, Python 3.11; local application only. The user selected Docker/self-hosted preparation.

## Release decision

**NO-GO for public-road production alerts.** The local pilot software and synthetic pipeline have passed the checks below. They are not a trained-model benchmark, physical-camera trial, real GPS validation, container deployment or safety certification. No public deployment was performed.

## Actual software check receipt

| Check | Result | Scope |
|---|---|---|
| `npm test` | **52 passed / 0 failed** | Engine, animal/night, API, backup, camera ingestion, device/map, Pune pilot and system simulation tests |
| `npm run test:ui` | **7 passed / 0 failed** | React/jsdom interactions, bilingual preference and real ephemeral HTTP/SQLite backend; raised the long server-backed case timeout to avoid worker scheduling flakes |
| `vision/.venv/Scripts/python.exe -m pytest vision/tests -q` | **25 passed** | Video roundtrip, evaluator, configuration, mocked ONNX adapter, proposals and failure-preserving gallery |
| `npm run typecheck` | Passed | Strict TypeScript, including integration tests |
| `npm run build` | Passed | Production Vite bundle generated |
| `npm audit` | **0 reported vulnerabilities** | Installed npm dependency tree at check time; not a security audit |
| `npm run test:pipeline` | Passed | Actual synthetic predictions replayed through authenticated API and route alerts |
| `node --import tsx --test tests/adapter.test.ts tests/device.test.ts` | **8 passed / 0 failed** | Camera/GPS envelope, replay/backpressure and bounded OpenStreetMap link helper |
| `npm run test:ui` | **7 passed / 0 failed** | 4 server/synthetic interaction tests plus 3 Hindi/English preference tests |
| `docker compose config --quiet` | Passed | Compose syntax/interpolation with an existing private config file |
| `docker desktop start` / `docker info` | Blocked | Desktop startup failed; daemon reports unable to start |
| `docker compose build` | **Blocked/failed** | Cannot build while Docker Desktop engine is unavailable |
| Lint | Not configured | No lint pass claimed |

**Total automated test cases: 60 passed.** The pipeline smoke check is additional. Different frameworks count tests differently; none measures physical driver safety.

The current count is **52 Node tests + 7 UI tests + 25 Python tests = 84 test cases**, with the pipeline smoke check additionally passing. Earlier counts are stale and superseded by this receipt.

The local server was started using private generated credentials outside the repository. Public checks observed `/healthz` 200, `/api/readiness` 200 with `roadSafetyValidated: false`, unauthenticated `/api/hazards` 401, and `/` 200 HTML. The production frontend is available on http://localhost:8080 while that process remains running. It binds to loopback only. The API database is persistent locally, but its current temporary host location is not a production retention/backup arrangement.

Browser text observation confirmed the extended preview renders. Direct interactive browser verification remained limited by browser-panel state, and opening the second preview timed out without dispatch. The previous browser-interaction gap was addressed with reproducible React interaction tests, but **full real-browser layout/accessibility/device testing remains outstanding**.

## What the UI integration tests actually did

1. Changed two-wheeler and night controls and verified warning thresholds changed from 310 m → 360 m → 420 m for the seeded critical pothole; switched to a parallel route and excluded the main-road warning.
2. Requested repair, submitted repeated same-source clear reports (not closed), then a second independent source report (closed); remounted and verified persistence.
3. Applied a storage event, rejected malformed cross-tab data, restored from corrupt stored JSON and reset to six current synthetic hazards.
4. Started a real ephemeral authenticated API backed by a SQLite file, connected through the UI, submitted source-bound night animal evidence, obtained a provisional server warning, restarted the API, verified durable evidence, disconnected and verified token clearing. Tokens were generated for the test and never stored in browser storage.
5. Started a real HTTP server with `FixedSegmentMatcher`, submitted NDJSON camera/GPS metadata, verified conversion to an animal observation, replay response, persisted hazard state and metrics that do not expose the source token. Verified the endpoint returns 503 when no matcher is configured.

These are jsdom-based functional tests, not actual driving or a screen-reader audit.

## Video test receipt

Used **simulation**, which the request permitted. No external dashcam footage was downloaded or republished. Eight original MJPEG AVI clips contain 192 frames (320×240): day/night pothole, animal, clean-road negative and hard-negative scenes.

The baseline is **hand-written color/shape computer vision, not a trained neural model**. It receives decoded pixels only; ground truth is independently defined by the drawing geometry. Both paths are tailored to these procedural fixtures, so even a high score has very narrow meaning.

| Subset | Frames | True positives | False positives | False negatives | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|
| Overall | 192 | 96 | 3 | 0 | 96.97% | 100% |
| Day | 96 | 48 | 0 | 0 | 100% | 100% |
| Night | 96 | 48 | 3 | 0 | 94.12% | 100% |
| Clean-road negatives | 48 | 0 | 0 | 0 | Undefined | Undefined |
| Hard negatives | 48 | 0 | 3 | 0 | 0% | Undefined |

Matching is class-aware one-to-one at IoU ≥0.5, not mAP. Mean matched-only IoU is 0.959276. Adjacent frames are correlated, not independent samples. Night means a brightness multiplier of 0.38; headlight glare, rain, motion blur, occlusion and realistic sensor noise are absent.

**Known failure retained:** three target-colored night hard-negative frames triggered false detections. They are not fixed by overfitting thresholds to the evaluation fixture. An example is embedded in `simulation-preview.html` with a red false-positive box. The case is an explicit reason not to claim reliable night detection.

Machine-readable summary: `video-results.json`. Detailed generated predictions, per-video checksums and measured fixture-only timing: `../vision/artifacts/evaluation/results.json` and `predictions.json`. The portable HTML report embeds its images so it can be opened without the generated folder.

### End-to-end synthetic result

`npm run test:pipeline` read the actual 99 frame predictions (96 positive instances plus 3 false positives), sent them through an enrolled source credential to the real HTTP API and computed two-wheeler/night route alerts:

- 99 observations accepted; 3 location/type clusters.
- All clusters remained **provisional** because every observation had the same synthetic source identity. Frames/videos were not relabelled as independent cameras.
- Correct route returned 2 warnings: pothole at 170 m and animal at 230 m, both provisional with 380 m thresholds.
- Parallel route returned 0 warnings.
- The false-positive cluster was retained at the explicit hard-negative fixture location (950 m), outside the approaching vehicle's current warning zone.

Fixture locations were explicit scenario metadata, not inferred GPS. All observations used a common replay capture epoch; no streaming latency claim is made. This demonstrates software data flow and relevance rules, not model generalisation or physical cross-camera verification. Result: `pipeline-results.json`.

## Model status and internet-source review

The optional raw YOLOv8/v11 ONNX adapter implements preprocessing, class mapping, NMS and coordinate restoration, and fails closed without weights. Its preprocessing tests use an explicitly mocked session. **No trained model was executed.**

A public Hugging Face search found `seanjudelyons/yolov8n-pothole-segmentation-onnx`; its returned model metadata had no explicit licence/model-card provenance and it is a segmentation export rather than this adapter's supported raw detection contract. It was not downloaded, treated as production-approved or remapped to pretend compatibility. Generic COCO weights were not misrepresented as pothole-trained weights. The earlier reusable-component review is in `../docs/validation-and-reuse.md`.

To measure real model performance, supply permitted pothole-trained and animal-capable weights (or authorise a specifically licensed candidate), independently annotated local videos, and hardware targets. Models require class provenance and a recorded checksum. Internet availability alone is not a licence or evidence of suitability.

## Animal reporting behavior and remaining scope

- Categories: pothole, animal on road, possible animal incident (review required).
- Short animal evidence/corroboration windows and expiry prevent indefinitely recycling moving hazards.
- Single-source animal warnings are explicitly unverified rather than waiting silently for a second camera.
- Night and two-wheeler policy bonuses remain within 100–500 m; they are not validated stopping distances.
- Animal reports cannot corroborate potholes. Old animal episodes do not inherit past witness identities when reopened.
- A possible incident record is a **manual/simulated category**, not a trained collision detector. The video baseline detects only a drawn animal shape; it does not classify lying posture, injury, death or a collision sequence.
- No automatic emergency/animal-rescue reporting is sent. The authority workspace can record response intent; a real referral service needs jurisdiction, consent, contact-routing and human-review rules.

## Issues addressed during implementation

- Added source credential binding, strict schemas and role separation to prevent public clients asserting arbitrary camera identities or verified statuses.
- Added durable idempotency and payload-conflict detection; repeated camera frames cannot create independent evidence.
- Added transactional rollback, persistent event cursors, restart tests and online WAL-safe backups.
- Added origin/body/rate limits, static path protections and safe errors; no credentials or observation bodies are logged by the server.
- Bounded date validation prevents malformed stored timestamps from crashing UI formatting; startup rejects malformed persisted hazard state.
- Isolated the server and synthetic evidence stores; role tokens remain in memory only.
- Guarded server snapshots against out-of-order older cursors and dropped alert responses calculated for changed route controls. Cached computed alerts clear after 5 s.
- Fixed an integration-test query that matched multiple status elements and a TypeScript test-option error; all final checks above passed after correction.
- Added sanitized DOM assertion errors to avoid dumping even temporary test credentials into failure output.
- Wired the versioned camera/GPS contract into `POST /integration/camera/observations`, bounded NDJSON parsing, injected matcher loading via `ROADGUARD_MATCHER_MODULE`, and safe authenticated `/api/metrics` counters.

## Outstanding release gates

| Gate | Status / required evidence |
|---|---|
| Docker image build, non-root secret access, health/restart and volume persistence | Blocked by Docker Desktop engine failure; retest on a running host |
| Real trained pothole/animal model and class provenance | Missing |
| Night/lying-animal/collision evaluation on independent local footage | Missing; synthetic brightness tests are insufficient |
| Permitted dashcam/CCTV feeds and surveyed camera calibration | Missing |
| Real GNSS/IMU/road graph/carriageway localisation | Missing; fixed segments only |
| Real device-to-server-to-device delivery and loss/reconnect/lead-time metrics | Missing; no physical V2V or mobile runner |
| Public TLS origin, domain, firewall and secret distribution | Not configured/deployed |
| Sustained-load, disk-full, retention/compaction and disaster-recovery drills | Missing; histories grow and the single-node service is not fleet-scale |
| Device revocation/anti-Sybil, privacy retention and evidence access policy | Basic static credentials only; no production governance approval |
| Real-browser accessibility/responsive and mobile audio/haptic validation | Outstanding |
| Hindi/English presentation switch | Implemented and tested; backend records/model payloads remain canonical English/schema values |
| Browser GPS and camera capability check | Implemented/tested as an opt-in browser boundary; does not prove vehicle-camera access or perform route matching |
| Live map provider and production tile SLA | Not deployed; OpenStreetMap position-link preview only. Provider, attribution, route graph and tile terms remain deployment decisions |
| Qualified hazard analysis, closed-track car/rider trials and authority sign-off | Not performed |
| Public/paid market launch evidence | Not approved; see `docs/market-launch-checklist.md` |

### Latest hardening addition

The real server now exposes the camera contract at `POST /integration/camera/observations` when `ROADGUARD_MATCHER_MODULE` injects a deployment-owned matcher. It accepts bounded NDJSON, rejects without a matcher, binds the authenticated source identity, validates the resulting segment against the server's configured road set, records per-frame receipts and keeps replay behavior. `GET /api/metrics` exposes safe counters to authenticated reader/authority roles. The example matcher intentionally rejects; it is not a map provider. These endpoints were exercised by `tests/camera-api.test.ts` against an ephemeral HTTP server and deterministic matcher. They do not demonstrate real vehicle integration.

### Pune / Pimpri-Chinchwad pilot update

The pilot package is now configured for Pune/Pimpri-Chinchwad and `Asia/Kolkata`, with a deliberately unselected corridor and region bounds. It validates local USB-webcam/recorded-dashcam manifests, hashes, timestamps, Pune coordinates, annotation consent/licence evidence, and camera/GPS/IMU calibration checklists. It generates a deterministic annotation review queue. A five-provider catalogue was added for OSM/MapLibre/self-hosted OSRM/GraphHopper, Mapbox, HERE, Google Maps Platform and TomTom. Every provider is currently `not-configured`; no map or tile licence is inferred. Research and source links are recorded in `docs/pune-pilot-data-and-maps.md`. No public dataset or footage was downloaded.

### Complete-system simulation update

The deterministic simulation layer covers 20/40/60/100 km/h vehicles, opposite-carriageway filtering, message latency, offline cache, inaccurate GPS rejection, duplicate/multi-camera evidence, stale/repair transitions and CARLA/SUMO manifest validation. `tests/sim.test.ts` passes 5 tests. It is a regression substitute only: CARLA and SUMO runtimes have not been installed or executed here. The dataset/training/simulation plan is in `docs/dataset-and-simulation-plan.md`.

### Licence and local-dataset update

`pilot/licence-review.json` now records the reviewed source/terms URLs and conservative status for RDD2022, COCO, BDD100K and the RoadGuard procedural fixtures. RDD2022 Figshare metadata was identified as CC BY 4.0; COCO annotations are CC BY 4.0 but COCO does not own the source image copyrights; BDD100K repository code is BSD-3-Clause while dataset terms remain unverified. `commercialReleaseApproved` remains false.

The first Pune local dataset registry is established at `pilot/data/` with valid empty capture and annotation manifests plus a pending camera/GPS/IMU calibration checklist. It contains zero captures and zero annotations because no footage in the workspace is verified as Pune/PCMC, consented, licensed and independently labelled. The validators and review queue run successfully on these empty templates. The eight project videos remain synthetic fixtures and were not counted as local data.

Independent real-footage detector evaluation is **blocked**, not passed: no permitted Pune/PCMC footage or verified independent labelled footage exists in the workspace. The bounded synthetic detector evaluation remains the only measured vision result; it must not be presented as local or independent model accuracy.

An openly licensed external fog-road clip from Wikimedia Commons was downloaded for a **negative-only decode smoke test**: `pilot/external-footage/transmission-gully-fog.mpg`. Attribution, source, CC BY-SA 4.0 licence and SHA-256 are recorded in `pilot/external-footage/manifest.json` and `ATTRIBUTION.txt`. The detector decoded 125 frames and emitted 0 predictions. Because the clip has no ground-truth pothole/animal annotations and the detector is the synthetic baseline, this result is not precision, recall, model validation, Pune validation or safety evidence. The raw media is ignored by git; it must be reacquired from the recorded URL under the licence when needed.

The supplied Wikimedia pothole video `Cars Moving into pothole.webm` was also downloaded under CC BY-SA 4.0 and decoded as an unlabelled smoke test: 621 frames, 378 procedural-baseline pothole predictions and 3,618 animal predictions. This high prediction volume is a useful failure signal showing that the procedural baseline is not a usable detector on external footage; without frame annotations it is not an accuracy score. Attribution and SHA-256 are recorded beside the media.

RDD2022 Figshare metadata was downloaded and recorded. The full archive is 13.26 GB while the local drive had about 6.1 GB free, so it was not downloaded. The supplied India S3 mirror returned HTTP 403 and was not bypassed. The file list metadata was downloaded with 17,372 India path lines and checksum; see `pilot/external-footage/RDD2022-download-status.json`. No RDD images or annotations entered training.

The supplied Wikimedia `Cars Moving into pothole.webm` page was verified as a self-published Kumasi, Ghana video under CC BY-SA 4.0. It was downloaded unchanged with checksum `2327fb7ccacc68fab10a45753d868e09a6c9855ac0acae486aeefec15265f82d`. The external smoke run decoded 621 frames but the untrained procedural baseline produced 378 pothole and 3,618 animal predictions. Because the source has no frame-level boxes and the baseline is not a trained model, this is a demonstrated external-domain failure signal, not accuracy.

**Next concrete actions:** repair/start Docker Desktop and rerun the documented container checks; choose permitted trained weights and annotated pilot footage; select and license a production map/tile provider; connect the vehicle/OEM edge service to the JSON-line contract; then complete localisation/network/nighttime validation before any public-road warning trial. Do not substitute these software checks for that evidence.
