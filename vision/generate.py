"""Original procedural fixture assets, licensed MIT; labels come from drawing bounds."""
import json
from pathlib import Path
import cv2
import numpy as np


def assets():
    """Standalone BGRA fixtures: separate original pothole and animal drawings."""
    pothole = np.zeros((29, 61, 4), np.uint8)
    cv2.ellipse(pothole, (30, 14), (30, 14), 0, 0, 360, (185, 120, 35, 255), -1)
    animal = np.zeros((40, 53, 4), np.uint8)
    color = (25, 135, 200, 255)
    cv2.ellipse(animal, (22, 18), (22, 12), 0, 0, 360, color, -1)
    cv2.circle(animal, (43, 9), 9, color, -1)
    cv2.rectangle(animal, (7, 20), (13, 39), color, -1)
    cv2.rectangle(animal, (31, 20), (37, 39), color, -1)
    return {"pothole": pothole, "animal": animal}


def generate(destination, frames=24):
    if type(frames) is not int or frames < 1:
        raise ValueError("frames must be a positive integer")
    destination = Path(destination); destination.mkdir(parents=True, exist_ok=True)
    drawings = assets()
    for label, asset in drawings.items():
        if not cv2.imwrite(str(destination/f"asset-{label}.png"), asset):
            raise RuntimeError("failed to save synthetic asset")
    manifest = {"schema": 1, "license": "MIT (original procedural assets)", "seed": 2026,
                "width": 320, "height": 240, "fps": 12, "videos": []}
    for lighting in ["day", "night"]:
        for scene in ["pothole", "animal", "negative", "hard-negative"]:
            name = f"{lighting}-{scene}.avi"
            writer = cv2.VideoWriter(str(destination/name), cv2.VideoWriter_fourcc(*"MJPG"), 12, (320, 240))
            if not writer.isOpened():
                raise RuntimeError("MJPG writer unavailable")
            annotations = []
            try:
                for index in range(frames):
                    image = np.full((240, 320, 3), (170, 165, 150), np.uint8)
                    cv2.rectangle(image, (0, 75), (319, 239), (63, 63, 63), -1)
                    for lane_y in range(90 + index % 12, 240, 35):
                        cv2.rectangle(image, (157, lane_y), (162, lane_y+16), (220, 220, 220), -1)
                    x, y = 65 + index % 16 * 2, 140 + index % 8
                    objects = []
                    if scene == "pothole":
                        asset = drawings["pothole"]
                        roi = image[y:y+29, x:x+61]
                        roi[asset[:, :, 3] > 0] = asset[:, :, :3][asset[:, :, 3] > 0]
                        objects.append({"class": "pothole", "bbox": [x, y, x+61, y+29]})
                    elif scene == "animal":
                        asset = drawings["animal"]
                        roi = image[y-3:y+37, x:x+53]
                        roi[asset[:, :, 3] > 0] = asset[:, :, :3][asset[:, :, 3] > 0]
                        objects.append({"class": "animal", "bbox": [x, y-3, x+53, y+37]})
                    elif scene == "hard-negative":
                        # Same colors as targets, wrong shape; gray pothole-shaped shadow.
                        cv2.rectangle(image, (x, y), (x+52, y+35), (185, 120, 35), -1)
                        cv2.rectangle(image, (220, 150), (260, 180), (25, 135, 200), -1)
                        cv2.ellipse(image, (95, 205), (28, 12), 0, 0, 360, (25, 25, 25), -1)
                    if lighting == "night":
                        image = np.rint(image.astype(np.float32)*.38).astype(np.uint8)
                    writer.write(image)
                    annotations.append({"frame": index, "objects": objects})
            finally:
                writer.release()
            manifest["videos"].append({"file": name, "lighting": lighting, "scene": scene, "frames": annotations})
    (destination/"manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
