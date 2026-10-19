import json
import sys
import subprocess
import types
import cv2
import numpy as np
import pytest
from vision.detectors import OnnxYolo, SyntheticBaseline, validate_mapping, nms
from vision.evaluate import evaluate, iou, match, summarize
from vision.generate import generate
from vision.proposals import proposals
from vision.report import render_report


def box(label="pothole", bounds=None, confidence=.9):
    return {"class": label, "bbox": bounds or [0, 0, 20, 20], "confidence": confidence}


def test_empty_negatives_are_undefined_not_perfect_accuracy():
    assert match([], []) == {"tp": 0, "fp": 0, "fn": 0, "ious": []}
    assert summarize([match([], [])])["precision"] is None
    assert summarize([match([], [])])["recall"] is None
    assert match([box()], [])["fp"] == 1
    assert match([], [box()])["fn"] == 1


def test_matching_is_class_aware_one_to_one_and_confidence_ordered():
    result = match([box(confidence=.8), box(confidence=.9), box("animal")], [box()])
    assert (result["tp"], result["fp"], result["fn"]) == (1, 2, 0)
    assert result["ious"] == [1]
    assert iou([0, 0, 10, 10], [5, 0, 15, 10]) == pytest.approx(1/3)
    assert match([box(bounds=[10, 10, 30, 30])], [box()])["tp"] == 0


@pytest.mark.parametrize("obj", [box("car"), box(bounds=[1, 1, 0, 2]), box(bounds=[0, 0, float("nan"), 2])])
def test_invalid_annotations(obj):
    with pytest.raises(ValueError):
        match([obj], [])


@pytest.mark.parametrize("frame", [None, np.zeros((2, 2)), np.zeros((2, 2, 3), np.float32), np.zeros((0, 2, 3), np.uint8)])
def test_invalid_frames(frame):
    with pytest.raises(ValueError):
        SyntheticBaseline().detect(frame)


@pytest.mark.parametrize("mapping", [None, [], {}, {0: "pothole"}, {"0": "car"}, {"0": ["pothole"]}, {"0": "animal"}, {"-1": "pothole"}])
def test_mapping_types(mapping):
    with pytest.raises(ValueError):
        validate_mapping(mapping)


def test_missing_model_fails_closed(tmp_path):
    with pytest.raises(ValueError, match="pothole-trained"):
        OnnxYolo(tmp_path/"missing.onnx", {"0": "pothole"}, 1)


def test_onnx_preprocessing_nms_and_mapping(tmp_path, monkeypatch):
    model = tmp_path/"fake.onnx"; model.write_bytes(b"mock session, not real model")
    class Session:
        def __init__(self, *args, **kwargs):
            pass
        def get_inputs(self):
            return [types.SimpleNamespace(name="images", type="tensor(float)", shape=[1, 3, 64, 64])]
        def run(self, _, inputs):
            tensor = inputs["images"]
            assert tensor.shape == (1, 3, 64, 64)
            assert tensor.dtype == np.float32
            assert tensor[0, 0, 32, 32] == 1  # BGR red becomes RGB red
            return [np.array([[[32, 32, 20, 10, .9], [32, 32, 20, 10, .8]]], np.float32)]
    monkeypatch.setitem(sys.modules, "onnxruntime", types.SimpleNamespace(InferenceSession=Session))
    adapter = OnnxYolo(model, {"0": "pothole"}, 1, 64)
    image = np.zeros((32, 64, 3), np.uint8); image[:, :, 2] = 255
    detected = adapter.detect(image)
    assert len(detected) == 1
    assert detected[0]["bbox"] == pytest.approx([22, 11, 42, 21])
    for count in [None, True, "1", 0]:
        with pytest.raises(ValueError):
            OnnxYolo(model, {"0": "pothole"}, count)
    assert nms(np.array([[0,0,10,10], [0,0,10,10], [20,20,30,30]]), np.array([.9,.8,.7]), .5) == [0,2]


def test_real_video_roundtrip_counts_and_decoded_pixels(tmp_path):
    fixtures = tmp_path/"fixtures"; output = tmp_path/"evaluation"
    manifest = generate(fixtures, frames=4)
    assert len(manifest["videos"]) == 8
    assert sum(len(frame["objects"]) for video in manifest["videos"] for frame in video["frames"]) == 16
    result = evaluate(fixtures/"manifest.json", SyntheticBaseline(), output)
    assert result["overall"]["frames"] == 32
    assert result["overall"]["tp"] == 16
    assert result["overall"]["fp"] == result["overall"]["fn"] == 0
    assert len(list(output.glob("*.jpg"))) == 16
    # Repeat generator gives identical labels and actual decoded pixels.
    second = tmp_path/"second"; assert generate(second, frames=4) == manifest
    for video in manifest["videos"]:
        a, b = cv2.VideoCapture(str(fixtures/video["file"])), cv2.VideoCapture(str(second/video["file"]))
        try:
            for _ in range(4):
                assert np.array_equal(a.read()[1], b.read()[1])
        finally:
            a.release(); b.release()


def test_frame_manifest_mismatch_fails(tmp_path):
    generate(tmp_path, frames=1)
    path = tmp_path/"manifest.json"; manifest = json.loads(path.read_text())
    manifest["videos"][0]["frames"].append({"frame": 1, "objects": []})
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="missing decoded frame"):
        evaluate(path, SyntheticBaseline(), tmp_path/"out")


def test_extra_video_frames_fail_instead_of_being_ignored(tmp_path):
    generate(tmp_path, frames=2)
    path = tmp_path/"manifest.json"; manifest = json.loads(path.read_text())
    manifest["videos"][0]["frames"] = manifest["videos"][0]["frames"][:1]
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="extra frames"):
        evaluate(path, SyntheticBaseline(), tmp_path/"out")


def test_onnx_cli_never_falls_back_without_a_model(tmp_path):
    result = subprocess.run([sys.executable, "-m", "vision", "evaluate", "--detector", "onnx",
                             "--model", str(tmp_path/"absent.onnx")], capture_output=True, text=True)
    assert result.returncode == 2
    assert "pothole-trained" in result.stderr
    assert "SyntheticBaseline" not in result.stdout


def test_proposals_require_explicit_location_and_never_verify():
    prediction = [{"video": "a.avi", "frame": 0, "objects": [box("animal")]}]
    result = proposals(prediction, segment="seg", direction="northbound", offset_m=12, source="camera-1")
    assert result[0]["status"] == "proposed"
    assert result[0]["cross_camera_verified"] is False
    assert "injury/death not classified" in result[0]["description"]
    assert "latitude" not in result[0]
    for offset in [-1, float("nan"), True]:
        with pytest.raises(ValueError):
            proposals(prediction, segment="seg", direction="northbound", offset_m=offset, source="camera-1")
    with pytest.raises(ValueError):
        proposals(prediction, segment="", direction="northbound", offset_m=0, source="camera-1")


def test_portable_report_retains_known_false_positive_and_scope(tmp_path):
    fixtures = tmp_path/'vision/artifacts/fixtures'
    generate(fixtures, frames=24)
    evaluate(fixtures/'manifest.json', SyntheticBaseline(), tmp_path/'vision/artifacts/evaluation')
    report = render_report(tmp_path).read_text(encoding='utf-8')
    assert 'Not a trained AI model' in report
    assert 'Known failure:' in report
    assert 'data:image/jpeg;base64,' in report
    assert 'false positives' in report
