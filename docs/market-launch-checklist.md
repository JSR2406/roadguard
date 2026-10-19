# RoadGuard market-launch checklist

This is the launch control document for turning the tested software pilot into a real product. A checked software item does not authorize public-road warnings. Every external item needs an owner, evidence, date, operating geography and rollback plan.

## Software release — completed in this workspace

- [x] Strict hazard fusion and route-aware warning engine.
- [x] Pothole, animal-on-road and possible animal-incident review categories.
- [x] Hindi/English presentation switch.
- [x] Authenticated role-scoped API and source identity checks.
- [x] JSON-line camera/GPS contract with freshness, GPS accuracy, heading and route-match rejection.
- [x] Authenticated `/integration/camera/observations` endpoint when a matcher is injected.
- [x] Durable replay receipts, transactional SQLite state and online backup utility.
- [x] Operational `/api/metrics` snapshot, readiness and health endpoints.
- [x] Docker Compose hardening configuration and private credential provisioner.
- [x] Reproducible synthetic video and end-to-end API smoke tests.
- [x] Deterministic warning/evidence simulation for 20/40/60/100 km/h, latency, offline cache, GPS uncertainty, opposite carriageways and multi-camera repair flows.
- [x] CARLA/SUMO scenario manifest validators and acceptance matrix; runtimes not installed or executed.
- [x] Pune/Pimpri-Chinchwad pilot package with explicit Asia/Kolkata configuration, local capture/annotation schemas, licence evidence fields and calibration checklist.
- [x] Map-provider comparison catalogue with fail-closed `not-configured` status.

## Required before paid or public-road launch

### Perception and data

- [ ] Signed permission/licence for dashcam and CCTV footage in every launch geography.
- [ ] Confirm RDD2022/RDD2020 archive and model-weight terms in writing before any commercial training or distribution.
- [ ] Trained pothole and animal models with provenance, checksum, model card, class definitions and redistribution/inference rights.
- [ ] Independently labelled local videos split by road, journey, camera, weather and date; no adjacent-frame leakage.
- [ ] Night, glare, rain, occlusion, animal-on-road, lying-animal and possible-incident evaluation.
- [ ] Event-level metrics: false alerts/km and/hour, missed severe hazards, localisation p50/p95, duplicate events, latency p95/p99 and calibration drift.
- [ ] Human review policy for animal incidents; never infer injury/death from a detector label alone.

### Maps, GPS and camera integration

- [ ] Production map/tile provider selected, licensed, attributed and capacity-reviewed.
- [ ] `ROADGUARD_MATCHER_MODULE` deployed with a versioned directed road graph, carriageway/lane handling and uncertainty output.
- [ ] Real camera/OEM edge adapter selected: OEM SDK, Android Automotive service, approved RTSP/WebRTC gateway or dedicated edge computer.
- [ ] Source credentials bound to hardware/device identity; rotation, revocation and anti-replay exercised.
- [ ] GNSS/IMU timestamp and camera calibration verified on surveyed routes; GPS loss/degraded mode tested.
- [ ] Parallel roads, flyovers, junctions, U-turns, reroutes and reverse direction tested against ground truth.

### Safety and human factors

- [ ] Qualified hazard analysis and operating design domain approved.
- [ ] Closed-track car and two-wheeler tests with trained supervision.
- [ ] Advisory wording, audio/haptic timing, distraction and comprehension tested in Hindi and English.
- [ ] No steering, braking or evasive manoeuvre automation.
- [ ] Driver consent, privacy notices, retention/deletion and user-access workflows approved.
- [ ] Road authority repair ownership, incident escalation and emergency-service boundaries documented.

### Operations and security

- [ ] Docker engine build/run, restart, health, secret permissions, volume persistence and rollback verified on the target host.
- [ ] TLS 1.2+ (prefer TLS 1.3), exact origin, firewall, WAF/rate limits and certificate rotation configured.
- [ ] `/api/metrics` exported to external monitoring; alerts for error rate, stale camera coverage, queue/backpressure, storage, backup age and event lag.
- [ ] Load, soak, network partition, duplicate/replay, disk-full and restore drills completed.
- [ ] SQLite scale limit reviewed; move to PostgreSQL/PostGIS and a durable broker before fleet scale.
- [ ] Security review, dependency scanning, threat model, incident response and access audit completed.
- [ ] Support, rollback and kill-switch process tested by the operations owner.

## Current decision

RoadGuard is **software-pilot ready, not market-ready** until the unchecked external evidence exists. The system must remain in provisional/advisory mode and display the readiness warning. Do not remove `roadSafetyValidated: false` or present synthetic metrics as real-world accuracy.
