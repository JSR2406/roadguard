# RoadGuard reproducible video experiments

This is a **synthetic-only simulation**, not a trained AI detector or evidence of
day/night road safety. It runs without Torch, Ultralytics, cameras, API keys, or
external media. The baseline reads decoded BGR pixels only and uses explicit HSV,
area, aspect-ratio, and contour-fill rules. It never receives ground truth.

## Reproduce (Python 3.11, from the roadguard directory)

```powershell
python -m venv vision/.venv
vision/.venv/Scripts/python.exe -m pip install -r vision/requirements.txt
vision/.venv/Scripts/python.exe -m pytest vision/tests -q
vision/.venv/Scripts/python.exe -m vision generate
vision/.venv/Scripts/python.exe -m vision evaluate
```

On Linux/macOS use `vision/.venv/bin/python` instead. Dependencies are installed
only inside this local environment. Direct dependencies are pinned; exact MJPEG
bytes/timing may vary between operating systems and codec builds.

Default fixtures: `vision/artifacts/fixtures/`

- Eight 320×240 MJPEG AVI videos at 12 fps, 24 frames each (192 frames total).
- Day and night each have separate pothole, animal, empty negative, and hard
  negative videos. Hazard videos each have one annotated object per frame:
  48 potholes and 48 animals total. The other 96 frames have no hazards.
- `asset-pothole.png` and `asset-animal.png` are original standalone transparent
  procedural drawings. They are fictional shapes, not real photographs.
- `manifest.json` has contiguous zero-based frame IDs and per-frame class/`bbox`.
  Bounds are `[left, top, right, bottom]` with exclusive right/bottom edges.
- Ground truth comes from drawing geometry in `generate.py`, not a detector.
  Detector thresholds are separately implemented in `detectors.py`.
- Night is 38% brightness, **not realistic nighttime capture**. There is no rain,
  headlight glare, motion blur, occlusion, sensor noise, or distribution diversity.
- Hard negatives use target-colored rectangles and a dark elliptical shadow.
  Video compression can cause false positives, which are retained in evaluation.
- Generation is deterministic (no random draws; manifest records seed 2026 for
  dataset identity). Tests compare repeated decoded pixels and label manifests.

## Evaluation outputs

`vision/artifacts/evaluation/results.json` includes per-video SHA-256, manifest
SHA-256, package versions, aggregate/day/night/scene counts, precision, recall,
mean **matched-only** IoU, detector FPS, and decode+detect FPS.
`predictions.json` includes every frame, including empty predictions.
Sixteen labeled JPEG previews are written (first and midpoint of every video).

Matching is class-aware, confidence-descending greedy, one prediction per truth
box, at IoU ≥ 0.5. Unmatched predictions are false positives and unmatched labels
are false negatives. Undefined precision/recall and empty matched IoU are JSON
`null`, never a misleading perfect score. This is not mAP. FPS excludes model
initialization, ground-truth matching and preview I/O; wall time also reported.
Missing/extra frames and invalid annotation boxes fail instead of dropping data.

## External openly licensed footage smoke test

`vision/evaluate_external.py` can decode an explicitly registered external video and run the procedural baseline. It reports only decoded-frame and prediction counts when no annotations exist; it never invents negatives, precision, recall or safety results. A video described as a pothole scene is still not frame-level ground truth:

```powershell
vision/.venv/Scripts/python.exe -m vision.evaluate_external pilot/external-footage/transmission-gully-fog.mpg --output reports/external-fog-smoke.json
```

The downloaded Commons asset is recorded with author, source page, CC BY-SA 4.0 terms, SHA-256 and non-Pune status in `pilot/external-footage/manifest.json`. External open footage is separate from the empty Pune local dataset and must be manually annotated before accuracy evaluation.

### Actual local run (Windows, Python 3.11, OpenCV 4.12.0)

| Subset | Frames | TP | FP | FN | Precision | Recall | Matched IoU |
|---|---:|---:|---:|---:|---:|---:|---:|
| All | 192 | 96 | 3 | 0 | .969697 | 1.000000 | .959276 |
| Day | 96 | 48 | 0 | 0 | 1.000000 | 1.000000 | .951503 |
| Night | 96 | 48 | 3 | 0 | .941176 | 1.000000 | .967050 |
| Empty negatives | 48 | 0 | 0 | 0 | undefined | undefined | undefined |
| Hard negatives | 48 | 0 | 3 | 0 | .000000 | undefined | undefined |

Measured detector-only throughput: 1465.07 fps; decode+detect: 792.85
fps; total wall time including previews: 0.471 seconds. These are tiny 320×240
fixture CPU measurements, not model performance or deployment guarantees.

## Optional genuine ONNX inference path

No pretrained model, external dataset, or dashcam video was downloaded. Therefore
**real-world and trained-model accuracy are unmeasured**. There is no fallback to
COCO pretending to detect potholes. A class map cannot turn a generic COCO model
into a pothole-trained model; supply actual trained weights with permission.

```powershell
vision/.venv/Scripts/python.exe -m pip install -r vision/requirements-onnx.txt
vision/.venv/Scripts/python.exe -m vision evaluate --detector onnx --model path/to/permitted-pothole.onnx --class-count 2 --class-map '{"0":"pothole","1":"animal"}' --input-size 640 --output vision/artifacts/onnx-evaluation
```

Adapter contract: one float32 NCHW square RGB input; letterbox with fill 114;
divide by 255; one raw YOLOv8/v11 detection output `[1,4+C,N]` or `[1,N,4+C]`;
boxes are center-x/center-y/width/height in input pixels; C class probability
scores; no objectness. Explicit total class count, numeric ID → semantic class
mapping, and at least a pothole class are required. Defaults: confidence .25,
class-aware NMS IoU .45, CPUExecutionProvider. Coordinates are unletterboxed and
clipped. YOLOv5 objectness, normalized-coordinate, segmentation, quantized input,
and end-to-end NMS exports are unsupported. Missing model/configuration fails
closed; dependency or session errors cannot silently switch to synthetic output.

Before using an external model, record its source URL, license/permission,
SHA-256, trained classes, export layout, and associated dataset license. Model
SHA-256, class mapping and runtime settings are included in evaluation output. Use
independently annotated real videos to measure accuracy. Only the adapter's
preprocess/NMS/mapping is unit-tested here with an explicitly mocked session;
no trained-model runtime execution is claimed.

## Optional observation proposals

```powershell
vision/.venv/Scripts/python.exe -m vision export-proposals --predictions vision/artifacts/evaluation/predictions.json --output vision/artifacts/proposals.json --segment demo-segment --direction northbound --offset-m 125 --source synthetic-camera-1
```

Segment, direction, offset in meters and source are explicit user inputs. The
same supplied segment offset is attached to each proposal: it is not a moving
object track or a location estimate. Pixel positions never become geolocation.
Repeated frames from one video remain proposals, never independent cross-camera
corroboration. Nothing is automatically verified or published. Animal detections
mean **possible animal scene for human review**, never injury/death classification.
Proposal JSON is an offline interchange file, not an automatic backend import.

## Asset permission

The procedural drawings and generated videos are original assets made for this
repository and supplied under the MIT license in `vision/LICENSE`. No external
photographs, model weights, or footage are redistributed. Generated binaries,
weights, the local environment, and artifacts are excluded by `vision/.gitignore`.
