# RoadGuard model and complete-system validation plan

Research and implementation update: 19 October 2026. This plan uses the requested candidates but does not treat their availability as permission or safety evidence.

## Dataset roles

| Dataset | Role | Licence/terms status | Limit |
|---|---|---|---|
| [RDD2022](https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547) / [CRDDC page](https://crddc2022.sekilab.global/) | India road-damage/pothole training and benchmark; D40 | Dataset record/project page identifies the India data, D00/D10/D20/D40 and citation. Commercial reuse terms for every archive/annotation/weight still require written confirmation. | Not a Pune monsoon/night/animal dataset. |
| [COCO](https://cocodataset.org/#home) | Initial animal class prototype: dog, cat, cow, horse, sheep and other supported categories | Use the official Terms of Use and per-image attribution/third-party-rights requirements. Do not infer that every image or derived weight has the same commercial terms. | General scenes, not Indian roads, headlights, lying animals or collision evidence. |
| [BDD100K](https://github.com/bdd100k/bdd100k) | Driving-context and domain-shift evaluation; day/night/weather/vehicle context; optional GPS/IMU metadata | Repository code licence is BSD-3-Clause; underlying data terms and use rights must be confirmed from the provider before training/distribution. | Not a pothole dataset and not a Pune road-animal benchmark. |
| Local Pune/PCMC captures | Final validation and fine-tuning strata: night, rain, glare, occlusion, clean road, pothole, animal and review-required incident | **Not collected yet.** Requires authority/participant/camera/privacy permissions and a written retention/licence record. | This is required local evidence, not optional polish. |

## Licence procedure

For each downloaded archive, image set, annotation release and checkpoint, create a private licence record containing source URL, access date, version, checksum, copyright/attribution text, commercial-use status, redistribution status, model-use restrictions and approving reviewer. If any field is unknown, the asset stays out of training and distribution. Keep raw datasets outside git.

## Training and test separation

1. Start with RDD2022 India for D40 pothole detection and retain its original labels/citation.
2. Start animal detection with COCO classes only as an engineering baseline; map supported classes explicitly and do not claim coverage of every Indian animal.
3. Use BDD100K only for driving-context robustness and negative/background evaluation after terms review, not as pothole truth.
4. Add local labelled footage with splits by road segment, journey, camera and date. Adjacent frames from one drive must not cross train/test.
5. Hold out a Pune night/rain/glare/occlusion set until final evaluation. Report event-level precision/recall, false alerts per km/hour, missed severe hazards, localisation error and calibration—not only frame mAP.
6. Keep animal incident as a temporal/operator-review event. A class label must never become an injury/death or confirmed collision claim.

The optional ONNX adapter accepts only an explicitly supplied permitted model. It does not download RDD/COCO weights or silently convert generic weights into pothole/animal models.

## Complete-system test layers

### Recorded-video replay

Replay dashcam footage while supplying explicit synthetic GPS, direction, speed and hazard coordinates. Feed predictions through the authenticated camera/GPS envelope and route-matching boundary. Use one source for duplicate/replay tests and genuinely distinct sources for corroboration. `npm run test:pipeline` demonstrates this with original procedural clips, not real road footage.

### CARLA virtual camera/sensor layer

CARLA’s official site describes RGB/depth/semantic cameras, GNSS and IMU sensors, weather control, actors and record/replay. The [sensor reference](https://carla.readthedocs.io/en/latest/ref_sensors/) documents RGB camera, GNSS and IMU outputs and noise attributes. Use CARLA to produce camera frames plus timestamped GNSS/IMU metadata for RoadGuard’s adapter contract.

Required scenarios include day/night, rain, glare, fog, obstruction, custom pothole/animal assets with permitted licences, independent simulated cameras, GPS noise, dropped frames, delayed delivery, opposite carriageways, parallel roads, flyovers and reroutes.

CARLA execution is **not installed or run in this workspace**. The repository contains a manifest contract and deterministic validator only.

### SUMO traffic/warning layer

SUMO is an open-source microscopic traffic simulator. Its official documentation states the software is EPL-2.0 with a GPL-2-or-later secondary option. Use it to exercise warning timing independently of image detection: 20/40/60/100 km/h, message loss, latency, cache, rerouting, opposite carriageways and uncertain GPS.

SUMO execution is **not installed or run in this workspace**. The repository simulation layer is a deterministic substitute for software regression, not a SUMO result.

### Multi-camera evidence

The evidence simulator feeds two distinct sources into the existing engine and tests duplicate reports, conflicting types, stale evidence, repair requests and fresh clear evidence. A repeated video under a second label must not be used as independent corroboration.

## Scenario acceptance matrix

| Scenario | Expected assertion |
|---|---|
| Daylight pothole | Correct class/location candidate or corroborated hazard |
| Night/rain pothole | Report recall, nuisance alerts and uncertainty separately |
| Animal crosses road | Animal warning with explicit provisional/review wording |
| 20/40/60/100 km/h | Warning threshold changes monotonically within policy; validate lead time separately |
| Opposite carriageway | No route-relevant alert |
| Two vehicles same pothole | One hazard, no duplicate alert storm |
| CCTV possible repair | Remains pending until fresh independent explicit-clear evidence |
| Internet failure | Use only fresh cached hazards; show degraded state and never infer safety |
| Inaccurate GPS | Reject or mark uncertain; do not confirm road segment |
| Delayed/high traffic | Measure p50/p95/p99 detection-to-alert latency and drops |

## Current status

- Dataset files/weights: **not downloaded; licence confirmation pending**.
- Local Pune footage: **not collected; permissions/hardware pending**.
- CARLA: **manifest contract only; runtime not installed**.
- SUMO: **deterministic TypeScript simulation only; runtime not installed**.
- Real-world safety: **not validated**.

`roadSafetyValidated: false` must remain unchanged until external evidence and approvals are complete.
