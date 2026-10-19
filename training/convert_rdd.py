from __future__ import annotations
import argparse,json,shutil
from pathlib import Path
from .common import valid_box

def convert(report: dict, output: str) -> dict:
    out=Path(output); counts={"train":0,"val":0,"test":0}; blocked=[]
    for split, records in report.get("splits", {}).items():
        for rec in records:
            src=Path(rec["image"])
            if not rec.get("valid") or not rec.get("annotations"): blocked.append(str(src)); continue
            d=out/split; d.mkdir(parents=True,exist_ok=True); shutil.copy2(src,d/src.name)
            lines=[]
            for ann in rec["annotations"]:
                x1,y1,x2,y2=ann["box"]; w,h=rec.get("width"),rec.get("height")
                if not w or not h or not valid_box(x1,y1,x2,y2,w,h): continue
                lines.append(f"0 {((x1+x2)/2/w):.8f} {((y1+y2)/2/h):.8f} {(x2-x1)/w:.8f} {(y2-y1)/h:.8f}")
            if lines: (d/(src.stem+".txt")).write_text("\n".join(lines)+"\n"); counts[split]+=1
    return {"roadSafetyValidated":False,"converted":counts,"skipped":blocked}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("report"); ap.add_argument("output"); a=ap.parse_args(); r=json.loads(Path(a.report).read_text()); print(json.dumps(convert(r,a.output),indent=2))
if __name__=="__main__": main()
