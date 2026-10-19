"""One-to-one class-aware bounding box evaluation on decoded video frames."""
import hashlib
import json
import time
from pathlib import Path
import cv2
import numpy as np
from .detectors import CLASSES


def iou(a, b):
    intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    union = max(0, a[2]-a[0])*max(0, a[3]-a[1]) + max(0, b[2]-b[0])*max(0, b[3]-b[1]) - intersection
    return intersection/union if union else 0.0


def match(predictions, truth, threshold=.5):
    if not 0 < threshold <= 1:
        raise ValueError("IoU threshold must be in (0,1]")
    for obj in [*predictions, *truth]:
        box = obj.get("bbox", [])
        if not isinstance(obj.get("class"), str) or obj["class"] not in CLASSES or not isinstance(box, (list, tuple)) or len(box) != 4 or not all(isinstance(x, (float, int)) and not isinstance(x, bool) and float('-inf') < x < float('inf') for x in box) or box[2] <= box[0] or box[3] <= box[1]:
            raise ValueError("invalid class or xyxy bounding box")
    used = set(); overlaps = []
    for prediction in sorted(predictions, key=lambda p: p.get("confidence", 1), reverse=True):
        choices = [(iou(prediction["bbox"], obj["bbox"]), idx) for idx, obj in enumerate(truth) if idx not in used and obj["class"] == prediction["class"]]
        score, idx = max(choices, default=(0, -1))
        if score >= threshold:
            used.add(idx); overlaps.append(score)
    return {"tp": len(used), "fp": len(predictions)-len(used), "fn": len(truth)-len(used), "ious": overlaps}


def summarize(rows):
    tp, fp, fn = (sum(r[k] for r in rows) for k in ["tp", "fp", "fn"])
    overlaps = [v for r in rows for v in r["ious"]]
    return {"frames": len(rows), "tp": tp, "fp": fp, "fn": fn,
            "precision": tp/(tp+fp) if tp+fp else None,
            "recall": tp/(tp+fn) if tp+fn else None,
            "mean_matched_iou": sum(overlaps)/len(overlaps) if overlaps else None}


def evaluate(manifest_path, detector, output):
    manifest_path = Path(manifest_path); data = json.loads(manifest_path.read_text(encoding="utf-8"))
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    rows = []; predictions = []; video_results = []; detect_seconds = decode_seconds = 0.0
    started = time.perf_counter()
    for video in data["videos"]:
        path = manifest_path.parent/video["file"]
        capture = cv2.VideoCapture(str(path))
        if not capture.isOpened():
            raise ValueError(f"cannot decode {path}")
        current = []
        try:
            for expected, annotation in enumerate(video["frames"]):
                if annotation["frame"] != expected:
                    raise ValueError("manifest frame indices must be contiguous from zero")
                tick = time.perf_counter(); ok, frame = capture.read(); decode_seconds += time.perf_counter()-tick
                if not ok:
                    raise ValueError(f"missing decoded frame {expected} in {path}")
                tick = time.perf_counter(); detected = detector.detect(frame); detect_seconds += time.perf_counter()-tick
                row = {**match(detected, annotation["objects"]), "lighting": video["lighting"], "scene": video["scene"]}
                rows.append(row); current.append(row)
                predictions.append({"video": video["file"], "frame": expected, "objects": detected})
                if expected in {0, len(video["frames"])//2}:
                    for obj in detected:
                        x1, y1, x2, y2 = map(round, obj["bbox"])
                        cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
                        cv2.putText(frame, obj["class"], (x1, max(12,y1-5)), cv2.FONT_HERSHEY_SIMPLEX, .4, (0,255,0), 1)
                    if not cv2.imwrite(str(output/f"{path.stem}-{expected:04d}.jpg"), frame):
                        raise RuntimeError("failed to save overlay")
            ok, _ = capture.read()
            if ok:
                raise ValueError(f"video has extra frames absent from manifest: {path}")
        finally:
            capture.release()
        video_results.append({"file": video["file"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), **summarize(current)})
    elapsed = time.perf_counter()-started
    result = {"scope": "original procedural fixtures only; not evidence of real-road safety",
              "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
              "versions": {"opencv": cv2.__version__, "numpy": np.__version__},
              "detector": type(detector).__name__, "detector_config": detector.metadata,
              "iou_threshold": .5, "overall": summarize(rows),
              "day_night": {k: summarize([r for r in rows if r["lighting"] == k]) for k in ["day", "night"]},
              "by_scene": {k: summarize([r for r in rows if r["scene"] == k]) for k in ["pothole", "animal", "negative", "hard-negative"]},
              "timing": {"detect_seconds": detect_seconds, "decode_seconds": decode_seconds,
                         "wall_seconds_including_previews": elapsed,
                         "detect_fps": len(rows)/detect_seconds if detect_seconds else None,
                         "decode_detect_fps": len(rows)/(detect_seconds+decode_seconds) if detect_seconds+decode_seconds else None},
              "videos": video_results}
    (output/"results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (output/"predictions.json").write_text(json.dumps(predictions, indent=2), encoding="utf-8")
    return result
