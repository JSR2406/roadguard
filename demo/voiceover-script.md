# RoadGuard demo voice-over script

Target duration: 2 minutes 30 seconds. Voice: clear, neutral English. This script describes the current synthetic pilot honestly; it does not claim trained-model or road-safety validation.

## 0:00–0:15 — Opening

“This is RoadGuard, a hazard-intelligence pilot for potholes and animal-related road hazards. It combines camera observations, route context, vehicle state, and strict evidence rules to produce advisory alerts.”

## 0:15–0:35 — Dashboard

“The dashboard starts in Synthetic Demo mode, so the workflow can be explored without uploading footage or credentials. The map and hazard cards show active evidence, severity, direction, confidence, and the source history behind each finding.”

## 0:35–0:58 — Vehicle context

“The operator can change route, direction, speed, vehicle type, and lighting. RoadGuard uses these inputs to decide whether a hazard is relevant ahead. Thresholds are bounded and deterministic; a hazard behind the vehicle or on the wrong route is excluded.”

## 0:58–1:20 — Hazard types

“Potholes remain separate from animal-on-road observations and possible animal incidents. An animal observation means review is required. It never becomes an injury, death, or collision claim. Night and two-wheeler adjustments change advisory priority without pretending to be a safety certification.”

## 1:20–1:43 — Evidence fusion

“Repeated frames from the same source do not create independent corroboration. A second, genuinely independent source can corroborate a hazard within the configured time and distance boundaries. Duplicate, stale, malformed, or low-quality evidence is rejected or recorded as a quality event.”

## 1:43–2:05 — Repair workflow

“When a road authority requests a response, RoadGuard does not close the hazard immediately. Closure requires fresh, explicit clear-view observations from independent sources, newer than the original finding. Until then, the status remains active or pending rather than silently becoming safe.”

## 2:05–2:23 — Server workspace

“The Server Workspace demonstrates the authenticated path. Role-scoped credentials control readers, sources, and authorities. The Node and SQLite service persists evidence, audit records, replay protection, and API event cursors while keeping credentials out of the frontend.”

## 2:23–2:40 — Closing limitations

“This is a tested software pilot, not a production road-safety system. The current detector is a transparent synthetic baseline; no trained pothole model, local labelled footage, physical camera calibration, or safety validation is claimed. RoadGuard keeps roadSafetyValidated false until those gates are completed.”

## 2:40–2:50 — Close

“The repository, validation reports, deployment instructions, and reproducible experiments are included with the project. This is RoadGuard: evidence-first hazard intelligence for a safer, more accountable pilot.”
