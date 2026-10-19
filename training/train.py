from __future__ import annotations
import argparse, importlib.util, json
from pathlib import Path

def train(config: dict) -> dict:
    if not config.get("permitted", False): return {"status":"blocked","reason":"training_not_permitted","roadSafetyValidated":False}
    if importlib.util.find_spec("ultralytics") is None: return {"status":"blocked","reason":"missing_dependency: ultralytics","roadSafetyValidated":False}
    data=Path(config.get("data",""));
    if not data.exists(): return {"status":"blocked","reason":"missing_data","roadSafetyValidated":False}
    model_path = Path(config.get("model", ""))
    if not model_path.is_file(): return {"status":"blocked","reason":"missing_local_model_checkpoint_no_download_allowed","roadSafetyValidated":False}
    if not config.get("modelLicenseVerified", False): return {"status":"blocked","reason":"model_license_not_verified","roadSafetyValidated":False}
    from ultralytics import YOLO
    model=YOLO(str(model_path)); result=model.train(data=str(data),epochs=int(config.get("epochs",10)),imgsz=int(config.get("imgsz",640)),project=config.get("project","runs"),name=config.get("name","roadguard"),seed=int(config.get("seed",42)),patience=int(config.get("patience",20)))
    return {"status":"completed","result":str(result),"roadSafetyValidated":False}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("config"); a=ap.parse_args()
    raw = Path(a.config).read_text()
    config = json.loads(raw) if a.config.endswith(".json") else __import__("yaml").safe_load(raw)
    print(json.dumps(train(config), indent=2))
if __name__=="__main__": main()
