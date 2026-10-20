# Graph Report - roadguard  (2026-10-20)

## Corpus Check
- 109 files · ~257,993 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 797 nodes · 1356 edges · 53 communities (40 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44ac3afd`
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
- manifests.ts
- RoadGuard model and complete-system validation plan
- manifest.json
- training.test.py
- RoadGuard pothole detector
- export.py
- training/README.md
- main.py
- Repository Audit: Multi-Asset Personal AI Investment Assistant
- WorkspaceStore
- compilerOptions
- frontend/src/App.tsx
- dependencies
- RoadGuard demo voice-over script
- create_demo_video.py
- Local deployment and test guide
- MVP verification record
- package.json
- Multi-Asset AI Research Assistant (MVP)
- dependencies
- Architecture and phased integration plan
- capture_ui_video.py
- demo/README.md
- app/__init__.py
- jsdom
- @types/react-dom
- vite
- vitest

## God Nodes (most connected - your core abstractions)
1. `createRoadguardServer()` - 24 edges
2. `WorkspaceStore` - 23 edges
3. `ingestObservation()` - 21 edges
4. `App()` - 19 edges
5. `getAlerts()` - 16 edges
6. `Candle` - 15 edges
7. `compilerOptions` - 15 edges
8. `DemoNseProvider` - 13 edges
9. `SyntheticBaseline` - 13 edges
10. `DemoCryptoProvider` - 12 edges

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

## Communities (53 total, 13 thin omitted)

### Community 0 - "camera-contract.mjs"
Cohesion: 0.08
Nodes (23): CameraSourceAdapter, ReplayOptions, SimulatedReplayAdapter, FixedSegmentMatcher, GpsRouteMatcher, CAMERA_FIELDS, convertEnvelope(), ENVELOPE_FIELDS (+15 more)

### Community 1 - "compilerOptions"
Cohesion: 0.11
Nodes (18): node, tests, compilerOptions, allowImportingTsExtensions, jsx, lib, module, moduleResolution (+10 more)

### Community 2 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, pilot:queue, pilot:validate-annotations, pilot:validate-captures, provision, start (+4 more)

### Community 3 - "engine.ts"
Cohesion: 0.06
Nodes (74): replayCameraEvidence(), copyHazards(), simulateWarnings(), warningScenario(), CameraReplayResult, CameraReplayScenario, ConnectionState, DirectedHazard (+66 more)

### Community 4 - "LiveWorkspace.tsx"
Cohesion: 0.11
Nodes (20): AlertList(), CameraCapability, GpsState, inspectBrowserCamera(), openStreetMapUrl(), startGpsWatch(), Context, I18nProvider() (+12 more)

### Community 5 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @testing-library/react, @testing-library/user-event, tsx, @types/jsdom, @types/node, @types/react, typescript (+7 more)

### Community 6 - "RoadGuard: feasibility, reuse and implementation validation"
Cohesion: 0.17
Nodes (11): 1. Feasibility verdict and necessary changes, 2. Related projects and what to reuse, 3. Implemented policy and its limits, 4. Production architecture and contracts, 5. Phased implementation and validation gates, 6. Inputs needed before real integrations, Automated prototype checks, Critical localisation distinction (+3 more)

### Community 7 - "Self-hosted pilot deployment"
Cohesion: 0.06
Nodes (32): 1. Prerequisites, 2. Verify software first, 3. Provision credentials privately, 4. Prepare Compose, 5. Non-Docker local start, 6. Verify deployed behavior, 7. Backups, restore and operations, 8. Release blockers (+24 more)

### Community 8 - "test_pipeline.py"
Cohesion: 0.09
Nodes (41): parametrize, RuntimeError, nms(), OnnxYolo, Detectors receive pixels only, never ground-truth annotations., Color/shape rules for our own procedural assets; NOT trained AI., Raw YOLOv8/v11 [1,4+classes,N] or [1,N,4+classes] ONNX adapter. Explicitly does…, SyntheticBaseline (+33 more)

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

### Community 22 - "manifests.ts"
Cohesion: 0.38
Nodes (6): CarlaCamera, CarlaSensorScenario, nonnegative(), SumolikeTrafficScenario, validateCarlaScenario(), validateSumoScenario()

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

### Community 29 - "main.py"
Cohesion: 0.06
Nodes (59): BaseModel, date, datetime, multi_asset_snapshot(), research_snapshot(), simple_moving_average(), AlertInput, get_alerts() (+51 more)

### Community 30 - "Repository Audit: Multi-Asset Personal AI Investment Assistant"
Cohesion: 0.06
Nodes (32): 10. Unresolved questions and risks, 11. Decision, 1. Executive recommendation, 2. Repository comparison, 3. License and data-source findings, 4. Crypto provider comparison, 5. Quantitative validation findings, 6. Asset-specific validation methodology (+24 more)

### Community 31 - "WorkspaceStore"
Cohesion: 0.15
Nodes (8): Any, Connection, Local, credential-free workspace persistence for the research assistant., SQLite repository for personal research state; provider secrets are not stored., WorkspaceStore, WorkspaceTests, PathLike, Row

### Community 32 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, isolatedModules, jsx, lib, module (+12 more)

### Community 33 - "frontend/src/App.tsx"
Cohesion: 0.11
Nodes (12): App(), addInstrument(), AssetClass, cryptoSeed, Entry, equitySeed, initialEntries, ResearchResult (+4 more)

### Community 34 - "dependencies"
Cohesion: 0.11
Nodes (17): dependencies, react, react-dom, typescript, vite, @vitejs/plugin-react, devDependencies, react (+9 more)

### Community 35 - "RoadGuard demo voice-over script"
Cohesion: 0.18
Nodes (10): 0:00–0:15 — Opening, 0:15–0:35 — Dashboard, 0:35–0:58 — Vehicle context, 0:58–1:20 — Hazard types, 1:20–1:43 — Evidence fusion, 1:43–2:05 — Repair workflow, 2:05–2:23 — Server workspace, 2:23–2:40 — Closing limitations (+2 more)

### Community 36 - "create_demo_video.py"
Cohesion: 0.44
Nodes (8): create_audio(), font(), main(), make_slides(), make_ui_frames(), Path, Create an honest, narrated RoadGuard submission demo from project facts. This…, Turn real captured app screens into a paced video sequence.

### Community 37 - "Local deployment and test guide"
Cohesion: 0.25
Nodes (7): Checks, Dependency installation, Development mode, Local deployment and test guide, Optional public read-only smoke mode, Security boundary, Single-container mode

### Community 38 - "MVP verification record"
Cohesion: 0.25
Nodes (7): DECIDE, Deployment verification, DO, Multi-asset audit extension, MVP verification record, PLAN, VERIFY

### Community 39 - "package.json"
Cohesion: 0.25
Nodes (7): engines, node, npm, name, private, type, version

### Community 40 - "Multi-Asset AI Research Assistant (MVP)"
Cohesion: 0.29
Nodes (6): Checks, Multi-Asset AI Research Assistant (MVP), Run as one local deployment, Run locally, What is and is not ready, What is implemented

### Community 41 - "dependencies"
Cohesion: 0.29
Nodes (7): lucide-react, dependencies, lucide-react, react, react-dom, react, react-dom

### Community 42 - "Architecture and phased integration plan"
Cohesion: 0.40
Nodes (4): Architecture and phased integration plan, Explicit non-goals for the MVP, Phases, Recommended foundation

## Knowledge Gaps
- **273 isolated node(s):** `ReplayOptions`, `private`, `type`, `dev`, `build` (+268 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PublicProviderError` connect `main.py` to `test_pipeline.py`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `createRoadguardServer()` connect `createRoadguardServer` to `camera-contract.mjs`, `engine.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `WorkspaceStore` connect `WorkspaceStore` to `main.py`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `ReplayOptions`, `private`, `type` to the rest of the system?**
  _273 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `camera-contract.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `engine.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06367041198501873 - nodes in this community are weakly interconnected._