# Graph Report - roadguard  (2026-10-18)

## Corpus Check
- 41 files · ~27,097 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 335 nodes · 593 edges · 17 communities (13 shown, 4 thin omitted)
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
- App.tsx
- devDependencies
- RoadGuard: feasibility, reuse and implementation validation
- Self-hosted pilot deployment
- test_pipeline.py
- createRoadguardServer
- RoadGuard reproducible video experiments
- index.d.mts
- backup.mjs
- provision.mjs
- __init__.py
- Vehicle camera/GPS integration contract

## God Nodes (most connected - your core abstractions)
1. `createRoadguardServer()` - 21 edges
2. `App()` - 19 edges
3. `ingestObservation()` - 19 edges
4. `getAlerts()` - 14 edges
5. `validateHazard()` - 12 edges
6. `compilerOptions` - 11 edges
7. `SyntheticBaseline` - 11 edges
8. `validateObservation()` - 10 edges
9. `warningDistance()` - 10 edges
10. `priorityScore()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createRoadguardServer()` --calls--> `getAlerts()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `createRoadguardServer()` --calls--> `ingestObservation()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `createRoadguardServer()` --calls--> `priorityScore()`  [EXTRACTED]
  server/index.mjs → src/engine.ts
- `start()` --calls--> `createRoadguardServer()`  [EXTRACTED]
  tests/api.test.ts → server/index.mjs
- `verified()` --calls--> `ingestObservation()`  [EXTRACTED]
  tests/engine.test.ts → src/engine.ts

## Import Cycles
- None detected.

## Communities (17 total, 4 thin omitted)

### Community 0 - "camera-contract.mjs"
Cohesion: 0.09
Nodes (21): CameraSourceAdapter, ReplayOptions, SimulatedReplayAdapter, FixedSegmentMatcher, GpsRouteMatcher, CAMERA_FIELDS, convertEnvelope(), ENVELOPE_FIELDS (+13 more)

### Community 1 - "compilerOptions"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, node, src, tests, compilerOptions, allowImportingTsExtensions (+10 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (20): lucide-react, dependencies, lucide-react, react, react-dom, name, private, scripts (+12 more)

### Community 3 - "engine.ts"
Cohesion: 0.19
Nodes (32): direction(), evidenceWindow(), getAlerts(), hazardLabel(), ingestObservation(), lighting(), matches(), metadata() (+24 more)

### Community 4 - "App.tsx"
Cohesion: 0.07
Nodes (42): AlertList(), App(), initialState(), isObservation(), makeVehicle(), messageOf(), parseStore(), safeAlerts() (+34 more)

### Community 5 - "devDependencies"
Cohesion: 0.09
Nodes (23): jsdom, devDependencies, jsdom, @testing-library/react, @testing-library/user-event, tsx, @types/jsdom, @types/node (+15 more)

### Community 6 - "RoadGuard: feasibility, reuse and implementation validation"
Cohesion: 0.17
Nodes (11): 1. Feasibility verdict and necessary changes, 2. Related projects and what to reuse, 3. Implemented policy and its limits, 4. Production architecture and contracts, 5. Phased implementation and validation gates, 6. Inputs needed before real integrations, Automated prototype checks, Critical localisation distinction (+3 more)

### Community 7 - "Self-hosted pilot deployment"
Cohesion: 0.07
Nodes (26): 1. Prerequisites, 2. Verify software first, 3. Provision credentials privately, 4. Prepare Compose, 5. Non-Docker local start, 6. Verify deployed behavior, 7. Backups, restore and operations, 8. Release blockers (+18 more)

### Community 8 - "test_pipeline.py"
Cohesion: 0.10
Nodes (36): parametrize, nms(), OnnxYolo, Detectors receive pixels only, never ground-truth annotations., Color/shape rules for our own procedural assets; NOT trained AI., Raw YOLOv8/v11 [1,4+classes,N] or [1,N,4+classes] ONNX adapter. Explicitly does…, SyntheticBaseline, validate_frame() (+28 more)

### Community 9 - "createRoadguardServer"
Cohesion: 0.10
Nodes (27): ApiError, canonical(), createRoadguardServer(), authenticate(), commit(), rate(), serveStatic(), finite() (+19 more)

### Community 10 - "RoadGuard reproducible video experiments"
Cohesion: 0.25
Nodes (7): Actual local run (Windows, Python 3.11, OpenCV 4.12.0), Asset permission, Evaluation outputs, Optional genuine ONNX inference path, Optional observation proposals, Reproduce (Python 3.11, from the roadguard directory), RoadGuard reproducible video experiments

### Community 16 - "Vehicle camera/GPS integration contract"
Cohesion: 0.29
Nodes (6): Device and media constraints, Envelope (JSON Lines), HTTP contract, Operational acceptance, Vehicle camera/GPS integration contract, WebSocket contract

## Knowledge Gaps
- **120 isolated node(s):** `ReplayOptions`, `name`, `version`, `private`, `type` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createRoadguardServer()` connect `createRoadguardServer` to `engine.ts`, `App.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `ingestObservation()` connect `engine.ts` to `createRoadguardServer`, `App.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `scripts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `ReplayOptions`, `name`, `version` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `camera-contract.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09475806451612903 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._