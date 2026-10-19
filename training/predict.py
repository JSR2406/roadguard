from __future__ import annotations
import argparse, importlib.util, json
from pathlib import Path
from .common import IMAGE_EXTENSIONS

def predict(path: str, model: str | None = None) -> dict:
    p=Path(path)
    if not p.exists(): return {"status":"blocked","reason":"missing_input","predictions":[],"roadSafetyValidated":False}
    if p.is_dir(): files=[str(x) for x in p.rglob("*") if x.suffix.lower() in IMAGE_EXTENSIONS]
    else: files=[str(p)]
    if not files: return {"status":"ok","predictions":[],"roadSafetyValidated":False}
    if importlib.util.find_spec("ultralytics") is None: return {"status":"blocked","reason":"missing_dependency: ultralytics","predictions":[],"roadSafetyValidated":False}
    if not model or not Path(model).exists(): return {"status":"blocked","reason":"missing_model","predictions":[],"roadSafetyValidated":False}
    from ultralytics import YOLO
    rows=[]
    for r in YOLO(model)(files,verbose=False):
        boxes=[]
        for b in r.boxes: boxes.append({"label":"pothole","score":float(b.conf[0]),"box":[float(v) for v in b.xyxy[0]]})
        rows.append({"image":str(r.path),"boxes":boxes})
    return {"status":"ok","predictions":rows,"roadSafetyValidated":False}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("input"); ap.add_argument("--model"); a=ap.parse_args(); print(json.dumps(predict(a.input,a.model),indent=2))
if __name__=="__main__": main()
