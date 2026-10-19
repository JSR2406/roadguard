# Graph Report - roadguard  (2026-10-19)

## Corpus Check
- 83 files · ~246,442 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 522 nodes · 895 edges · 29 communities (23 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b90ce6ac`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- camera-contract.mjs
- compilerOptions
- scripts
- engine.ts
- LiveWorkspace.tsx
- devDependencies
- RoadGuard: feasibility, reuse and implementation validation
- Self-hosted pilot deployment
- test_pipeline.py
- createRoadguardServer
- RoadGuard reproducible video experiments
- Required before paid or public-road launch
- backup.mjs
- provision.mjs
- __init__.py
- Vehicle camera/GPS integration contract
- validate.ts
- RoadGuard Pune pilot package
- providers.ts
- Pune / Pimpri-Chinchwad pilot: data and map decision record
- sim/types.ts
- RoadGuard model and complete-system validation plan
- manifest.json
- training.test.py
- RoadGuard pothole detector
- export.py
- training/README.md

## God Nodes (most connected - your core abstractions)
1. `createRoadguardServer()` - 24 edges
2. `ingestObservation()` - 21 edges
3. `App()` - 19 edges
4. `getAlerts()` - 16 edges
5. `SyntheticBaseline` - 13 edges
6. `scripts` - 12 edges
7. `LiveWorkspace()` - 12 edges
8. `validateHazard()` - 12 edges
9. `compilerOptions` - 11 edges
10. `validateObservation()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `RoadguardOptions` --references--> `GpsRouteMatcher`  [EXTRACTED]
  server/index.d.mts → adapter/gps-route-matcher.ts
- `createRoadguardServer()` --calls--> `getAlerts()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `createRoadguardServer()` --calls--> `ingestObservation()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `createRoadguardServer()` --calls--> `priorityScore()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `start()` --calls--> `createRoadguardServer()`  [EXTRACTED]
  tests/api.test.ts → server/index.mjs

## Import Cycles
- None detected.

## Communities (29 total, 6 thin omitted)

### Community 0 - "camera-contract.mjs"
Cohesion: 0.08
Nodes (23): CameraSourceAdapter, ReplayOptions, SimulatedReplayAdapter, FixedSegmentMatcher, GpsRouteMatcher, CAMERA_FIELDS, convertEnvelope(), ENVELOPE_FIELDS (+15 more)

### Community 1 - "compilerOptions"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, node, src, tests, compilerOptions, allowImportingTsExtensions (+10 more)

### Community 2 - "scripts"
Cohesion: 0.08
Nodes (23): lucide-react, dependencies, lucide-react, react, react-dom, name, private, scripts (+15 more)

### Community 3 - "engine.ts"
Cohesion: 0.09
Nodes (59): CameraReplayScenario, SimVehicle, App(), initialState(), isObservation(), makeVehicle(), messageOf(), parseStore() (+51 more)

### Community 4 - "LiveWorkspace.tsx"
Cohesion: 0.11
Nodes (20): AlertList(), CameraCapability, GpsState, inspectBrowserCamera(), openStreetMapUrl(), startGpsWatch(), Context, I18nProvider() (+12 more)

### Community 5 - "devDependencies"
Cohesion: 0.09
Nodes (23): jsdom, devDependencies, jsdom, @testing-library/react, @testing-library/user-event, tsx, @types/jsdom, @types/node (+15 more)

### Community 6 - "RoadGuard: feasibility, reuse and implementation validation"
Cohesion: 0.17
Nodes (11): 1. Feasibility verdict and necessary changes, 2. Related projects and what to reuse, 3. Implemented policy and its limits, 4. Production architecture and contracts, 5. Phased implementation and validation gates, 6. Inputs needed before real integrations, Automated prototype checks, Critical localisation distinction (+3 more)

### Community 7 - "Self-hosted pilot deployment"
Cohesion: 0.06
Nodes (30): 1. Prerequisites, 2. Verify software first, 3. Provision credentials privately, 4. Prepare Compose, 5. Non-Docker local start, 6. Verify deployed behavior, 7. Backups, restore and operations, 8. Release blockers (+22 more)

### Community 8 - "test_pipeline.py"
Cohesion: 0.09
Nodes (40): parametrize, nms(), OnnxYolo, Detectors receive pixels only, never ground-truth annotations., Color/shape rules for our own procedural assets; NOT trained AI., Raw YOLOv8/v11 [1,4+classes,N] or [1,N,4+classes] ONNX adapter. Explicitly does…, SyntheticBaseline, validate_frame() (+32 more)

### Community 9 - "createRoadguardServer"
Cohesion: 0.10
Nodes (28): ApiError, canonical(), createRoadguardServer(), authenticate(), commit(), rate(), serveStatic(), finite() (+20 more)

### Community 10 - "RoadGuard reproducible video experiments"
Cohesion: 0.22
Nodes (8): Actual local run (Windows, Python 3.11, OpenCV 4.12.0), Asset permission, Evaluation outputs, External openly licensed footage smoke test, Optional genuine ONNX inference path, Optional observation proposals, Reproduce (Python 3.11, from the roadguard directory), RoadGuard reproducible video experiments

### Community 11 - "Required before paid or public-road launch"
Cohesion: 0.22
Nodes (8): Current decision, Maps, GPS and camera integration, Operations and security, Perception and data, Required before paid or public-road launch, RoadGuard market-launch checklist, Safety and human factors, Software release — completed in this workspace

### Community 16 - "Vehicle camera/GPS integration contract"
Cohesion: 0.25
Nodes (7): Device and media constraints, Envelope (JSON Lines), HTTP contract, Live map and vehicle-camera rollout boundary, Operational acceptance, Vehicle camera/GPS integration contract, WebSocket contract

### Community 17 - "validate.ts"
Cohesion: 0.10
Nodes (31): PUNE_PILOT_CONFIG, generateReviewQueue(), priority(), ReviewQueueItem, Annotation, AnnotationLabel, AnnotationManifest, CalibrationChecklist (+23 more)

### Community 20 - "providers.ts"
Cohesion: 0.24
Nodes (6): MAP_PROVIDER_PROFILES, MapProviderId, MapProviderProfile, MapProviderStatus, RouteProvider, selectPilotProvider()

### Community 21 - "Pune / Pimpri-Chinchwad pilot: data and map decision record"
Cohesion: 0.22
Nodes (8): Licence review record, Local capture and labelling plan, Map/provider comparison, Missing inputs and release gates, Pilot boundary, Public dataset candidates, Pune / Pimpri-Chinchwad pilot: data and map decision record, Recommended staged choice

### Community 22 - "sim/types.ts"
Cohesion: 0.12
Nodes (21): replayCameraEvidence(), CarlaCamera, CarlaSensorScenario, nonnegative(), SumolikeTrafficScenario, validateCarlaScenario(), validateSumoScenario(), copyHazards() (+13 more)

### Community 23 - "RoadGuard model and complete-system validation plan"
Cohesion: 0.17
Nodes (11): CARLA virtual camera/sensor layer, Complete-system test layers, Current status, Dataset roles, Licence procedure, Multi-camera evidence, Recorded-video replay, RoadGuard model and complete-system validation plan (+3 more)

### Community 24 - "manifest.json"
Cohesion: 0.33
Nodes (5): assets, datasetId, locality, manifestVersion, purpose

### Community 25 - "training.test.py"
Cohesion: 0.12
Nodes (20): TrainingPipelineTests, deterministic_split(), group_key(), map_label(), Path, Only D40 is accepted as pothole; all other labels are deliberately excluded., valid_box(), convert() (+12 more)

### Community 26 - "RoadGuard pothole detector"
Cohesion: 0.33
Nodes (5): Data and provenance, Intended use, Limitations, Reproducibility, RoadGuard pothole detector

## Knowledge Gaps
- **181 isolated node(s):** `ReplayOptions`, `MapProviderId`, `MapProviderStatus`, `MapProviderProfile`, `name` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createRoadguardServer()` connect `createRoadguardServer` to `camera-contract.mjs`, `engine.ts`, `LiveWorkspace.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `ingestObservation()` connect `engine.ts` to `createRoadguardServer`, `sim/types.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `convertEnvelope()` connect `camera-contract.mjs` to `createRoadguardServer`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `ReplayOptions`, `MapProviderId`, `MapProviderStatus` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `camera-contract.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._