# RoadGuard Pune pilot package

Local-only schemas and deterministic helpers for an **unvalidated** Pune/Pimpri-Chinchwad pilot. The package never accesses a camera: USB webcam records are represented as local files, and recorded dashcam files are treated identically after capture.

## Commands

From `roadguard/` (no package changes required):

```bash
npx tsx pilot/cli.ts validate-captures path/to/captures.json
npx tsx pilot/cli.ts validate-annotations path/to/annotations.json
npx tsx pilot/cli.ts queue path/to/annotations.json
npx tsx --test tests/pilot.test.ts
```

`pilot/config.ts` contains the Pune coordinate bounds, `Asia/Kolkata`, and an explicit corridor placeholder. Replace the corridor placeholder only after local approval. Both `safetyValidated` and `roadSafetyValidated` are intentionally and permanently `false` in this pilot package.

Capture manifests require local paths, source kind, timestamp, duration, SHA-256, and optional Pune-bounded coordinates. Direct camera handles/claims are rejected. Annotation manifests support pothole, animal, lighting, weather, and occlusion labels, plus consent/licence evidence statuses. Calibration requires camera, GPS, and IMU entries.

Current operational gates are explicit: `hardwareState: "missing"` and consent/licence statuses may be `"missing"` or `"pending"`; these must not be inferred as verified. `selectedCorridor` remains a TODO placeholder.
