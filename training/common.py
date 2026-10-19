from __future__ import annotations
import hashlib, re
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

def map_label(label: str, source: str = "") -> str | None:
    """Only D40 is accepted as pothole; all other labels are deliberately excluded."""
    value = label.strip().lower()
    if value == "d40" or value == "pothole":
        return "pothole"
    return None

def valid_box(xmin: float, ymin: float, xmax: float, ymax: float, width: int, height: int) -> bool:
    return (width > 0 and height > 0 and all(map(lambda x: x == x and abs(x) != float("inf"), (xmin,ymin,xmax,ymax)))
            and 0 <= xmin < xmax <= width and 0 <= ymin < ymax <= height)

def group_key(path: str | Path, source: str = "", country: str = "") -> str:
    stem = Path(path).stem.lower()
    stem = re.sub(r"([_-]?(?:frame|image|img|copy|aug)[_-]?\d+)$", "", stem)
    return "|".join(x.lower() for x in (source or "unknown", country or "unknown", stem))

def deterministic_split(items: list[dict], seed: int = 42, ratios=(0.8, 0.1, 0.1)) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for item in items:
        groups.setdefault(item.get("group") or group_key(item["image"], item.get("source", ""), item.get("country", "")), []).append(item)
    ordered = sorted(groups, key=lambda g: hashlib.sha256(f"{seed}:{g}".encode()).hexdigest())
    total = len(items); targets = [total * r for r in ratios]; out = {"train": [], "val": [], "test": []}
    counts = [0, 0, 0]
    for group in ordered:
        idx = min(range(3), key=lambda i: (counts[i] - targets[i], i))
        out[tuple(out)[idx]].extend(groups[group]); counts[idx] += len(groups[group])
    return out
