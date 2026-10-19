import argparse
import json
from pathlib import Path
from .detectors import OnnxYolo, SyntheticBaseline
from .evaluate import evaluate
from .generate import generate
from .proposals import proposals


def main():
    parser = argparse.ArgumentParser(description="Fixture-only road video experiments")
    commands = parser.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("generate")
    gen.add_argument("--output", default="vision/artifacts/fixtures")
    gen.add_argument("--frames", type=int, default=24)
    run = commands.add_parser("evaluate")
    run.add_argument("--manifest", default="vision/artifacts/fixtures/manifest.json")
    run.add_argument("--output", default="vision/artifacts/evaluation")
    run.add_argument("--detector", choices=["synthetic", "onnx"], default="synthetic")
    run.add_argument("--model")
    run.add_argument("--class-map", help='JSON, for example {"0":"pothole","1":"animal"}')
    run.add_argument("--class-count", type=int)
    run.add_argument("--input-size", type=int, default=640)
    export = commands.add_parser("export-proposals")
    export.add_argument("--predictions", required=True)
    export.add_argument("--output", required=True)
    export.add_argument("--segment", required=True)
    export.add_argument("--direction", required=True)
    export.add_argument("--offset-m", type=float, required=True)
    export.add_argument("--source", required=True)
    args = parser.parse_args()
    try:
        if args.command == "generate":
            result = generate(args.output, args.frames)
            print(json.dumps({"videos": len(result["videos"]), "frames": args.frames*len(result["videos"])}))
        elif args.command == "evaluate":
            detector = SyntheticBaseline() if args.detector == "synthetic" else OnnxYolo(args.model, json.loads(args.class_map or "null"), args.class_count, args.input_size)
            result = evaluate(args.manifest, detector, args.output)
            print(json.dumps(result, indent=2))
        else:
            predictions = json.loads(Path(args.predictions).read_text(encoding="utf-8"))
            result = proposals(predictions, segment=args.segment, direction=args.direction, offset_m=args.offset_m, source=args.source)
            Path(args.output).write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(json.dumps({"proposals": len(result), "status": "proposed"}))
    except (ValueError, OSError, ImportError) as exc:
        parser.exit(2, f"error: {exc}\n")


if __name__ == "__main__":
    main()
