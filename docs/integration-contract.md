# Vehicle camera/GPS integration contract

This boundary accepts **metadata only**. A producer supplies one strict version-1 JSON object per line; it does not grant RoadGuard access to a camera, vehicle CAN bus, browser APIs, or an on-device ML model. `server/camera-contract.mjs` validates the envelope and converts it to the existing `Observation` only after a supplied route matcher resolves a directed segment and offset.

## Envelope (JSON Lines)

Required fields are `version: 1`, `deviceId`, `sourceId`, `sourceType` (`dashcam` or `cctv`), `captureTime`, `receiveTime` (Unix milliseconds), `frameId`, `hazardType` (`pothole`, `animal_on_road`, or `animal_incident`), `lighting` (`day`, `night`, or `unknown`), `confidence` (0..1), `clearView` (boolean), and `gps`. GPS contains `lat` (-90..90), `lon` (-180..180), `accuracyM`, `headingDeg` (0..360), `speedKph`, and `timestamp`. `cameraPosition` (`mount`, `fovDeg`) and `routeRef` (`routeId`, `expectedDirection`) are optional.

Unknown fields, arbitrary hazard states, invalid ranges, duplicate `sourceId:frameId` pairs, capture/receive skew, stale envelopes, stale GPS, poor accuracy, wrong heading, missing matcher results, and off-route positions are rejected with a stable reason. No location is guessed. `severity` is a fixed boundary mapping, not a caller-controlled status: pothole=medium, animal_on_road=high, animal_incident=critical. Animal incident evidence remains subject to operator-in-loop review before action.

## HTTP contract

* `POST /integration/camera/observations` accepts `application/x-ndjson` over TLS 1.2+ (prefer TLS 1.3), one envelope per line. The deployment must authenticate devices with short-lived, scoped credentials (mTLS or signed bearer tokens), rotate keys, bind identity to `deviceId/sourceId`, and audit receipt/rejection reasons without storing raw imagery by default.
* Return one result per input line: accepted observation or `{ok:false, reason}`. `401/403` means authentication or identity failure; `413` means payload limits; `429` means backpressure. Clients retry only transient transport/429 responses and retain frame IDs for idempotency.
* The self-hosted Node pilot exposes this contract at `POST /integration/camera/observations` only when a deployment injects a `GpsRouteMatcher`. It accepts at most 128 non-empty records and 64 KiB per request, authenticates the enrolled source token, converts each accepted envelope through the matcher, persists it transactionally and returns per-record receipts. Without a matcher it returns `503` rather than guessing a road location.
* Backpressure is explicit: bounded queues, a `429`/retry-after response, and client-side exponential backoff. Never drop silently, reorder, or process unbounded input. The simulated adapter models this with a bounded replay buffer.

## WebSocket contract

Use `wss://` only, authenticate during the TLS-protected handshake, and authorize the device for the requested route/source. Send JSON text frames containing the same envelope (not binary image frames). Server messages acknowledge each `frameId` with accepted/rejected reason. Apply a bounded receive queue; pause reads or close with a backpressure code when full. Reconnect with the same frame IDs and preserve ordering per source.

## Device and media constraints

Camera SDKs may run their own capture and perception pipeline, but must publish this contract and its timestamps; RoadGuard does not invoke browser camera APIs or run models. RTSP and WebRTC are upstream transport options and require a separate hardened gateway that emits metadata; credentials and streams must not be forwarded into this boundary. Android Automotive integrations require an approved parked/driver-distraction-safe service and OEM permissions. CarPlay is a display/projection surface, not a camera or CAN authority; use only permitted navigation context and keep review actions operator initiated.

GPS must be device-reported and timestamped. A route matcher is deployment-owned and must return segment, direction, offset, heading, and uncertainty. Fixed-segment matching in the module is a deterministic test fixture only; it is not a map integration. Animal incident notifications require an operator-in-loop review and must not be treated as an automatic emergency or enforcement decision.

## Operational acceptance

Run focused adapter tests with `node --import tsx --test tests/adapter.test.ts` and typecheck with `npm run typecheck`. These checks exercise validation, duplicate protection, GPS quality, heading/direction, off-route rejection, successful conversion, replay order, and bounded replay. They execute no real camera, map, RTSP, WebRTC, Android Automotive, CarPlay, or vehicle integration.

## Live map and vehicle-camera rollout boundary

The current server workspace can watch a browser's permitted geolocation and open the current coordinate in OpenStreetMap. It deliberately does not silently embed third-party tiles, infer a road location, or request a browser camera stream. Browser camera enumeration is a capability check only and does not prove access to a vehicle camera. A vehicle usually exposes its forward camera through an OEM SDK, an approved Android Automotive service, a permitted RTSP/WebRTC gateway, or a separate edge computer; the car's internal camera is not automatically available to a website or ordinary dashcam app.

The deployment map layer must be selected and licensed (for example, a self-hosted MapLibre renderer with an approved tile/style source, or a contracted map provider). It must map-match signed device GPS/heading to a versioned directed road graph, preserve lane/carriageway identity and return uncertainty. A coordinate link is not route matching. Do not use public OpenStreetMap tile servers as a production SLA without reviewing their usage policy and providing attribution.

The intended loop is: camera/OEM edge service captures frames → permitted model produces metadata and a short redacted evidence reference → device signs versioned envelope → TLS ingestion validates freshness/identity → route matcher resolves a directed segment or rejects → fusion engine produces provisional/verified hazard → server filters by approaching route → driver client renders a concise advisory → operator reviews animal incidents and repair state. The browser UI is an operator/pilot surface, not a vehicle camera bridge.

The pilot also exposes authenticated `GET /api/metrics` for operational counters (requests, errors, rejected/accepted camera records, active hazards and event cursor). It is intentionally a bounded in-process snapshot, not a Prometheus/OpenTelemetry implementation. Put it behind the same TLS/auth boundary and export it to a monitored system before fleet use; do not expose tokens or raw evidence in metrics.
