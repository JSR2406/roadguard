"""Evaluate the procedural baseline on an openly licensed unlabeled video.

This is a negative-only smoke test: without frame annotations it reports decode
and prediction counts, never precision/recall or safety performance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
from .detectors import SyntheticBaseline


def evaluate(path: Path) -> dict:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError(f"cannot decode {path}")
    detector = SyntheticBaseline()
    frames = 0
    predictions = 0
    by_class = {"pothole": 0, "animal": 0}
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            found = detector.detect(frame)
            frames += 1
            predictions += len(found)
            for item in found:
                by_class[item["class"]] += 1
    finally:
        capture.release()
    return {
        "scope": "Openly licensed external video, unlabeled negative-only smoke test; no precision/recall or safety claim",
        "file": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "framesDecoded": frames,
        "predictions": predictions,
        "predictionsByClass": by_class,
        "detector": detector.metadata,
        "groundTruth": "unavailable; manual frame annotation required before accuracy evaluation",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = evaluate(args.video)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
