"""Detectors receive pixels only, never ground-truth annotations."""
from pathlib import Path
import hashlib
import cv2
import numpy as np


CLASSES = {"pothole", "animal"}


def validate_mapping(mapping):
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("class mapping must be a nonempty JSON object")
    result = {}
    for key, value in mapping.items():
        if not isinstance(key, str) or not key.isdecimal() or not isinstance(value, str) or value not in CLASSES:
            raise ValueError("class mapping must map nonnegative class IDs to pothole or animal")
        result[int(key)] = value
    if "pothole" not in result.values():
        raise ValueError("model mapping must explicitly include a pothole-trained class")
    return result


def validate_frame(frame):
    if not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3 or min(frame.shape[:2]) == 0:
        raise ValueError("frame must be a nonempty uint8 HxWx3 BGR image")


class SyntheticBaseline:
    """Color/shape rules for our own procedural assets; NOT trained AI."""
    metadata = {"kind": "synthetic-only color and shape rules", "trained": False}
    def detect(self, frame):
        validate_frame(frame)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        predictions = []
        # Normalized hue survives the generator's brightness changes. Independent
        # thresholds intentionally reject gray lane marks and colored rectangles.
        for label, low, high in [("pothole", (95, 120, 40), (115, 255, 255)),
                                 ("animal", (10, 130, 40), (25, 255, 255))]:
            mask = cv2.inRange(hsv, np.array(low), np.array(high))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                area = cv2.contourArea(contour)
                fill = area / (w * h)
                if w < 15 or h < 10 or area < 150:
                    continue
                if label == "pothole" and not (1.3 < w / h < 3.5 and .58 < fill < .88):
                    continue
                if label == "animal" and not (.8 < w / h < 2.1 and .35 < fill < .86):
                    continue
                predictions.append({"class": label, "bbox": [x, y, x+w, y+h], "confidence": .9})
        return predictions


def nms(boxes, scores, threshold):
    keep = []
    order = np.argsort(-scores)
    while len(order):
        i = int(order[0]); keep.append(i)
        remaining = order[1:]
        if not len(remaining):
            break
        inter = np.maximum(0, np.minimum(boxes[i, 2:], boxes[remaining, 2:]) - np.maximum(boxes[i, :2], boxes[remaining, :2])).prod(axis=1)
        a = np.maximum(0, boxes[i, 2:] - boxes[i, :2]).prod()
        b = np.maximum(0, boxes[remaining, 2:] - boxes[remaining, :2]).prod(axis=1)
        overlap = inter / np.maximum(a+b-inter, 1e-9)
        order = remaining[overlap <= threshold]
    return keep


class OnnxYolo:
    """Raw YOLOv8/v11 [1,4+classes,N] or [1,N,4+classes] ONNX adapter.

    Explicitly does not accept YOLOv5 objectness or end-to-end/NMS exports.
    """
    def __init__(self, model, mapping, class_count, input_size=640, confidence=.25, iou=.45):
        if not model or not Path(model).is_file():
            raise ValueError("a user-provided, permitted pothole-trained .onnx model is required")
        self.mapping = validate_mapping(mapping)
        if type(class_count) is not int or class_count < 1 or max(self.mapping) >= class_count:
            raise ValueError("class_count must be a positive integer covering mapped IDs")
        if type(input_size) is not int or input_size < 32 or type(confidence) not in (int, float) or type(iou) not in (int, float) or not 0 <= confidence <= 1 or not 0 < iou <= 1:
            raise ValueError("invalid ONNX input size or thresholds")
        import onnxruntime as ort
        self.session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        inputs = self.session.get_inputs()
        if len(inputs) != 1 or inputs[0].type != "tensor(float)":
            raise ValueError("expected one float32 NCHW image input")
        shape = inputs[0].shape
        if len(shape) != 4 or any(isinstance(v, int) and v != wanted for v, wanted in zip(shape, [1, 3, input_size, input_size])):
            raise ValueError("model input must match configured square NCHW input size")
        self.name = inputs[0].name
        self.size, self.count, self.confidence, self.iou = input_size, class_count, confidence, iou
        with Path(model).open("rb") as handle:
            checksum = hashlib.file_digest(handle, "sha256").hexdigest()
        self.metadata = {"kind": "user-provided raw YOLO ONNX", "model_sha256": checksum,
                         "class_mapping": self.mapping, "class_count": class_count,
                         "input_size": input_size, "confidence_threshold": confidence,
                         "nms_iou_threshold": iou, "provider": "CPUExecutionProvider",
                         "license_and_training_provenance": "must be supplied by model owner"}

    def detect(self, frame):
        validate_frame(frame)
        h, w = frame.shape[:2]; scale = self.size / max(h, w)
        nw, nh = round(w*scale), round(h*scale)
        left, top = (self.size-nw)//2, (self.size-nh)//2
        canvas = np.full((self.size, self.size, 3), 114, np.uint8)
        canvas[top:top+nh, left:left+nw] = cv2.resize(frame, (nw, nh))
        tensor = np.ascontiguousarray(canvas[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255
        raw = self.session.run(None, {self.name: tensor})
        if len(raw) != 1 or raw[0].ndim != 3 or raw[0].shape[0] != 1:
            raise ValueError("expected one raw YOLOv8/v11 output")
        rows = raw[0][0]
        if rows.shape[0] == 4+self.count:
            rows = rows.T
        if rows.shape[1] != 4+self.count or not np.isfinite(rows).all():
            raise ValueError("output does not match configured raw YOLO class count")
        labels = rows[:, 4:].argmax(axis=1); scores = rows[:, 4:].max(axis=1)
        boxes = np.concatenate((rows[:, :2]-rows[:, 2:4]/2, rows[:, :2]+rows[:, 2:4]/2), axis=1)
        boxes[:, [0, 2]] = np.clip((boxes[:, [0, 2]]-left)/scale, 0, w)
        boxes[:, [1, 3]] = np.clip((boxes[:, [1, 3]]-top)/scale, 0, h)
        result = []
        for label, name in self.mapping.items():
            ids = np.flatnonzero((labels == label) & (scores >= self.confidence) & (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1]))
            for idx in nms(boxes[ids], scores[ids], self.iou):
                i = ids[idx]
                result.append({"class": name, "bbox": boxes[i].tolist(), "confidence": float(scores[i])})
        return result
