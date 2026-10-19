# RoadGuard: feasibility, reuse and implementation validation

Review date: 18 October 2026. This document separates publicly documented component capabilities, implemented simulation behavior and proposed field validation. No road trial, trained-model benchmark, hardware test, patent search or certification has been performed.

**Implementation update:** the subsequent extension adds animal/night policies, an authenticated persistent single-node API, a separate server UI, offline synthetic video tests and Docker packaging. The tables below describe the original feasibility assessment; consult `../reports/validation-report.md` and `deployment.md` for the latest actual verification and remaining blockers. Real GPS/cameras, trained-model inference and field safety remain unvalidated.

## 1. Feasibility verdict and necessary changes

The network is feasible as an advisory, cooperative hazard-monitoring system. A pothole detector alone is not a prevention network; geolocation, provenance, relevance filtering, delivery, maintenance workflow and human-factors validation are essential.

| Requested capability | Assessment / required change | Prototype status |
|---|---|---|
| Real-time smart-dashcam detection | Fine-tune an edge detector on local road footage; track across frames; benchmark thermal throttling and low light on selected hardware. Ordinary dashcams may not expose a usable video/API stream. | Simulated detections; no image inference |
| Adaptive 100–500 m warnings | Deliver known shared hazards ahead of arrival. Do not equate 500 m warning distance with 500 m camera visibility. Include latency, uncertainty and rider vulnerability. | Tested illustrative policy |
| Dashcam + CCTV verification | Match the same road-surface location using calibration and road topology. Distinct video streams may share upstream footage and are not automatically independent. CCTV must actually resolve the road surface; many traffic cameras cannot. | Distinct simulated source identities |
| GPS/route relevance | Map-match GPS to a directed road graph; use along-route distance, elevation/carriageway and confidence. GPS alone does not reliably identify a lane. | Explicit directed segments, no GPS matching |
| Hazard sharing | Start with cellular vehicle-to-cloud-to-vehicle regional subscriptions and a cached expiry policy. Direct C-V2X/DSRC is a separate hardware/regulatory integration. | Same-browser cross-tab sharing only |
| Continuous monitoring / repair | Revisit based on coverage; distinguish no observation, poor visibility, explicit clear evidence and repair completion. Reopen recurring hazards. | Evidence lifecycle implemented |
| Two-wheeler safety | Earlier advisory, concise audio/haptic option after rider testing; avoid sudden-manoeuvre instructions and distracting visuals. | Earlier threshold and dedicated text; no audio/haptics |
| Authority dashboard | Show evidence, uncertainty, exposure and ownership; prioritise by expected harm, not just detection confidence. | Evidence, severity/recency queue and repair requests; no real authority integration |

### Critical localisation distinction
The vehicle GPS coordinate is not the pothole coordinate. Localise the detected road patch using camera intrinsics/extrinsics, synchronised GNSS/IMU and geometry, or a surveyed CCTV road-plane transform. Record uncertainty in metres. A ground-plane homography can localise a surface patch on approximately planar road; it does not measure pothole depth. Depth/severity needs calibrated stereo/depth sensing or independent inspection. A single image bounding box cannot provide trustworthy physical depth.

## 2. Related projects and what to reuse

These are reviewed components/research resources, not verified complete matches for all eight requirements. No upstream code, models or datasets have been copied into this prototype. Pin releases/commits and review dependencies before adoption; this review is not a security audit.

| Resource | Evidence and useful part | Required adaptation / license caution |
|---|---|---|
| [Sekilab RoadDamageDetector](https://github.com/sekilab/RoadDamageDetector) | Official road-damage dataset/research repository; RDD2022 includes India and five other countries; D40 denotes potholes. Useful baseline annotations and evaluation lineage. | Use as detection training/evaluation input, not as a ready-made cooperative warning platform. Repository code is MIT; README states image data CC BY-SA 4.0. Check the exact downloaded dataset's own terms, attribution and downstream obligations separately. Older SSD/TensorFlow examples are references, not a reason to inherit the old runtime. |
| [RDD2022 dataset record](https://figshare.com/articles/dataset/21431547) | Dataset location linked by the official Sekilab repository. Useful country-diverse road-damage data. | Local CCTV viewpoint, video timing, physical depth and warning effectiveness need additional data. The record is linked from the reviewed repository; its independent terms were not fetched in this session. |
| [Ultralytics](https://github.com/ultralytics/ultralytics) | Candidate modern detector/training/export ecosystem. [Repository license](https://github.com/ultralytics/ultralytics/blob/main/LICENSE) was reviewed. | Current repository license is AGPL-3.0; evaluate obligations and any available commercial terms before integrating with a closed-source product. A general object detector must be trained/validated for D40 and local hard negatives; no accuracy or hardware latency is claimed here. This implementation does not depend on it. |
| [OSRM](https://github.com/Project-OSRM/osrm-backend) | Reviewed README documents Route, Nearest and Match services for road-network routing and noisy GPS map matching. | Add hazard persistence, direction/carriageway/elevation constraints, route-progress distance and subscription filtering; Match is not proof of correct lane. Self-host a regional extract for a pilot rather than relying on a public demo server. Code license is BSD-2-Clause per [license file](https://github.com/Project-OSRM/osrm-backend/blob/master/LICENSE.TXT); OpenStreetMap data has separate attribution/ODbL obligations. |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | [Reviewed license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt): BSD-3-Clause with bundled third-party notices. Appropriate candidate map renderer. | Add hazard layers and accessible evidence panels. Map tiles, styles, geocoding and underlying data have their own terms and hosting costs. Rendering a map does not perform route matching. Prototype instead uses a clearly labelled schematic. |

**Recommendation:** compose reusable detection, routing and rendering components behind stable contracts. Build the evidence-fusion, risk policy and repair-verification domain layer specifically for this project. Do not fork an arbitrary pothole demo and assume its confidence score validates safety.

## 3. Implemented policy and its limits

The simulation uses `clamp(100 + 1.5 × speedKph + 40 × severityRank + riderBonus, 100, 500)` metres, where severityRank is 0–3 and riderBonus is 50 m for two-wheelers. At 60 km/h a critical hazard gives 310 m for a car and 360 m for a two-wheeler. These constants are unvalidated hypotheses. The UI caps speed at 120 km/h; the engine validates 0–200 km/h. Stationary vehicles receive no approaching warning.

Production should instead evaluate perception/reaction time, end-to-end delay, positional uncertainty and a conservative deceleration model. At speed v in m/s, a starting engineering expression is `v × (reactionTime + deliveryDelay) + v²/(2a) + uncertaintyMargin`, modified by vehicle vulnerability and conditions. Parameters require qualified safety review and testing. If the required lead distance exceeds 500 m, do not silently claim the cap is safe: show an insufficient-lead-time condition or restrict the operating envelope. Late-arriving hazards within 100 m still need a carefully tested immediate advisory; the minimum is a desired advance-warning zone, not a reason to suppress a nearby hazard.

Evidence thresholds in this demo: confidence ≥0.70, explicit clear view, maximum age 15 min and future-clock tolerance 5 s. Corroboration needs two distinct source IDs within 15 m on the same directed segment. Hazard anchors stay fixed to prevent cluster drift; this can split observations near a boundary and needs calibrated uncertainty-aware spatial association in production. Alerts expire when the latest pothole observation exceeds 24 h. Expiry means unknown, not repaired. Repair closure needs two independent clear reports newer than both the request and last positive observation. A fresh positive after closure starts a new episode. These are inspectable rules, not calibrated probabilities.

The queue score is severity-dominant, with small corroboration and recency bonuses. It does not yet incorporate measured depth, traffic exposure, schools, rider prevalence, crash data, jurisdiction or service-level deadlines. Add these with authority agreement; display the score breakdown and permit audited human override.

## 4. Production architecture and contracts

1. **Edge observer:** video capture → road ROI → detector/segmentation → temporal tracking → road-patch localisation → privacy redaction → signed observation. Keep a short local buffer and upload minimal evidence clips/crops only under the agreed policy. Offline capture uses a bounded queue; never treat delayed uploads as fresh events.
2. **Ingestion API:** device authentication, source registration, timestamps, schema validation, replay protection, rate limits and provenance checks. Bind identity to enrolled hardware/stream; two arbitrary strings are not independent witnesses. Do not allow public client repair-state writes.
3. **Evidence worker:** map-match to a versioned directed graph; deduplicate tracks and frames; associate uncertainty-aware location clusters; maintain event log and current hazard state. CCTV calibration and stream health are separate records.
4. **Storage:** PostgreSQL/PostGIS for hazards, road references and observations; object storage for access-controlled redacted evidence; append-only audit log for status changes. Separate camera health and coverage from hazard absence.
5. **Delivery:** regional spatial subscriptions over MQTT/WebSocket through an authenticated gateway, short event TTLs, backpressure and sequence IDs. Vehicles receive candidate hazards in a lookahead corridor, then locally apply route/heading/age filtering. Show degraded state during network/GPS uncertainty. Standard phone push is unsuitable as the sole timely-alert transport.
6. **Driver client:** cached route graph/hazards, foreground location under OS permissions, local alert computation, per-journey cooldown/hysteresis and severity-escalation rules, minimal audio/haptic cues after validation. Never instruct swerving or automate steering/braking.
7. **Authority client:** jurisdiction-scoped role-based access, evidence timeline, dangerous/uncertain queues, work orders, SLA reporting, repair revisit tasks and audit exports.

Recommended observation additions beyond the demo types: schemaVersion, eventId, registeredSourceId, trackId, captureTime/receiveTime, modelVersion, calibratedConfidence, geometry and covariance, roadGraphVersion, directedEdgeId, cameraCalibrationId, visibility/occlusion quality, redactedEvidenceRef and signature. Treat confidence and severity as separate quantities. Record measured dimensions and measurement method only when available.

Recommended event/API boundaries (not implemented): `POST /observations`, `GET /hazards?corridor=...`, regional hazard-created/updated/expired messages, `POST /hazards/:id/repair-requests`, and audited repair-review endpoints. All require authorisation; malformed and duplicate events must not mutate state. Clients submit observations, not trusted "verified" or "repaired" flags.

### Security and privacy prerequisites
- Camera owner/road authority agreements and lawful video processing; no assumption of access to existing CCTV.
- Edge face/plate redaction where feasible; encrypted transit/storage, narrowly scoped signed evidence URLs, access audit and approved retention/deletion periods.
- Avoid sharing identifiable vehicle trajectories between drivers. Route filtering should be on-device or use minimal ephemeral corridor subscriptions.
- Device revocation, anti-replay and anti-Sybil controls; detect correlated sources, duplicated footage and compromised cameras.
- Threat model false hazards, location spoofing, malicious repair closure and denial of service. Browser-local demo storage provides none of these protections.

## 5. Phased implementation and validation gates

| Phase | Deliverable | Exit gate |
|---|---|---|
| A — decision prototype (implemented) | Synthetic fusion, driver controls, route filtering, evidence/repair dashboard | Engine regression tests, typecheck, build; explicitly no field-safety claim |
| B — video proof of concept | Licensed local video, D40-trained baseline, annotation guide, detector adapter and geolocation calibration | Held-out road/camera/day splits; review hard negatives; benchmark hardware latency and localisation error |
| C — networked pilot | Authenticated ingestion, PostGIS persistence, gateway, native driver client and one surveyed CCTV adapter | Two physical devices exchange fresh hazards; reconnect/replay/load tests; privacy and source-provenance review |
| D — closed-track advisory trial | Instrumented approaching cars/two-wheelers, trained safety supervision, latency and nuisance-alert measurement | Approved hazard analysis, adequate lead time within operating envelope, acceptable distraction/nuisance rates agreed before trial |
| E — authority-controlled field pilot | Limited geography, maintenance workflow, monitored performance and incident handling | Authority sign-off, operational ownership, release/rollback process and ongoing drift audits |

Indicative effort is highly dependent on hardware, footage and permissions; no credible production schedule or budget can be validated from requirements alone. Start with one corridor and a small enrolled fleet rather than city-wide CCTV integration.

### Evaluation protocol (proposed, not achieved)
- Split by road section, journey, camera and date; adjacent video frames must not leak across training/test sets. Include untouched clean road and repaired patches, shadows, puddles, utility covers, paint, debris and speed bumps.
- Report pothole precision/recall, PR curves and mAP, but also event-level false alerts per driving hour/km, duplicate events per pothole, missed severe hazards and localisation error (p50/p95). Break out night, rain, glare, occlusion, speed and small hazards. Bootstrap confidence intervals by independent road/journey, not individual frames.
- Benchmark capture → inference → upload → fusion → delivery → actual presentation end-to-end. Report p50/p95/p99 and packet loss under intermittent cellular service. A candidate starting latency target is p95 ≤2 s on the chosen corridor, **not** a demonstrated result or universal safety requirement.
- Measure relevant-route alert precision at parallel roads, flyovers, junctions, U-turns, repeated route segments and reroutes. Measure warning lead distance/time, not merely message delivery success.
- Establish a safety-reviewed minimum detection recall and acceptable nuisance-alert rate before any go/no-go decision; dataset mAP alone cannot set these. Compare a no-alert baseline in controlled conditions without exposing participants to unexpected hazards.
- Test repair closure against human-inspected ground truth, water-covered holes, temporary occlusion and recurring damage. Report false-closure and reopening rates; absence of detection is not negative evidence.
- Observe rider comprehension, distraction and response under an approved closed-track protocol. Do not ask untrained users to test warnings while operating a vehicle on public roads.

### Automated prototype checks
`npm test` currently exercises 12 test groups: source independence/idempotency, spatial grouping, freshness/quality boundaries, repair/reopening, monotonic warning thresholds, alert relevance/expiry, directed route arithmetic, repeated edges, priority ordering, malformed observations and malformed restored/vehicle data. This does not measure camera accuracy, real network delay or driving outcomes.

## 6. Inputs needed before real integrations

Choose the pilot city/corridor and responsible authority; identify dashcam models and whether footage streams/SDKs are available; supply permitted sample videos with synchronised location metadata; agree hosting and privacy constraints; decide mobile OS/device type; and confirm dataset/model licensing requirements. Keep these as explicit decisions rather than fabricated live integrations.
