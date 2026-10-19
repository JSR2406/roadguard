# Reproducible training pipeline

All inspection and conversion paths run without OpenCV, Torch, or Ultralytics. Training, prediction, and export return a structured `blocked` result when their dependency, permission, data, or model is absent.

```bash
python -m training.inspect_rdd DATASET -o reports/dataset-report.json
python -m training.convert_rdd reports/dataset-report.json data/roadguard
python -m training.train training/config.yaml
python -m training.evaluate ground-truth.json predictions.json -o reports/evaluation.json
python -m training.predict image-or-video --model runs/roadguard/weights/best.pt
python -m training.export runs/roadguard/weights/best.pt exports/model --format onnx
```

The inspection report is the provenance/licence record and must be reviewed before use. Use Python 3.11, PIL and PyYAML; optional metric acceleration can use NumPy/sklearn. No command downloads data or model weights. See `dataset.schema.yaml`, `report-template.json`, and `model-card.md`.
