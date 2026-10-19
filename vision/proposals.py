"""Explicit user-located proposals; pixels never imply geographic coordinates."""
import math


def proposals(predictions, *, segment, direction, offset_m, source):
    if not all(isinstance(v, str) and v.strip() for v in [segment, direction, source]):
        raise ValueError("explicit nonempty segment, direction, and source are required")
    if type(offset_m) not in (int, float) or not math.isfinite(offset_m) or offset_m < 0:
        raise ValueError("explicit finite nonnegative segment offset in meters is required")
    return [{"segment_id": segment, "direction": direction, "offset_m": offset_m,
             "location_basis": "user-supplied segment offset; not inferred from pixels",
             "source_id": source, "video": frame["video"], "frame": frame["frame"],
             "category": obj["class"], "bbox": obj["bbox"], "confidence": obj["confidence"],
             "status": "proposed", "requires_human_review": True,
             "cross_camera_verified": False,
             "description": "Possible animal scene for review; injury/death not classified" if obj["class"] == "animal" else "Possible pothole for review"}
            for frame in predictions for obj in frame["objects"]]
