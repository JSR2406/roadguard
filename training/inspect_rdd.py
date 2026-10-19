from __future__ import annotations
import argparse, hashlib, json, os, xml.etree.ElementTree as ET
from pathlib import Path
from .common import IMAGE_EXTENSIONS, map_label, valid_box, group_key, deterministic_split

def _image_size(path):
    try:
        from PIL import Image
        with Image.open(path) as im: return im.size
    except Exception: return None

def inspect(root: str) -> dict:
    rootp = Path(root); images = {p.stem.lower(): p for p in rootp.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS}
    records=[]; seen={}; invalid=[]; missing=[]; labels={}; duplicates=[]
    xmls = {p.stem.lower(): p for p in rootp.rglob("*.xml")}
    txts = {p.stem.lower(): p for p in rootp.rglob("*.txt")}
    for stem, image in sorted(images.items()):
        digest = None; size = _image_size(image)
        try: digest = hashlib.sha256(image.read_bytes()).hexdigest()
        except OSError: pass
        if digest and digest in seen: duplicates.append({"image":str(image),"duplicate_of":seen[digest]})
        elif digest: seen[digest]=str(image)
        ann=[]; ann_path=xmls.get(stem) or txts.get(stem)
        if ann_path and ann_path.suffix.lower()==".xml":
            try:
                tree=ET.parse(ann_path); rootx=tree.getroot(); declared=rootx.findtext("size/width")
                w,h=(int(rootx.findtext("size/width")),int(rootx.findtext("size/height"))) if declared else (size or (0,0))
                for obj in rootx.findall("object"):
                    raw=obj.findtext("name",""); box=obj.find("bndbox")
                    if box is None: invalid.append({"image":str(image),"reason":"missing_box"}); continue
                    vals=[float(box.findtext(k,"nan")) for k in ("xmin","ymin","xmax","ymax")]
                    if valid_box(*vals,w,h):
                        label=map_label(raw); labels[raw]=labels.get(raw,0)+1
                        if label: ann.append({"label":label,"box":vals})
                    else: invalid.append({"image":str(image),"reason":"invalid_box","label":raw})
            except Exception as exc: invalid.append({"image":str(image),"reason":"bad_annotation","detail":str(exc)})
        elif ann_path and ann_path.suffix.lower()==".txt":
            w,h=size or (0,0)
            for line in ann_path.read_text(errors="replace").splitlines():
                parts=line.split()
                if len(parts)!=5: invalid.append({"image":str(image),"reason":"bad_yolo_row"}); continue
                try: cls,xc,yc,bw,bh=parts[0],*map(float,parts[1:]); vals=[(xc-bw/2)*w,(yc-bh/2)*h,(xc+bw/2)*w,(yc+bh/2)*h]
                except ValueError: invalid.append({"image":str(image),"reason":"non_numeric"}); continue
                if valid_box(*vals,w,h) and map_label(cls): ann.append({"label":"pothole","box":vals})
                else: invalid.append({"image":str(image),"reason":"invalid_box"})
        else: missing.append(str(image))
        records.append({"image":str(image),"source":"RDD","country":"unknown","group":group_key(image,"RDD","unknown"),"annotations":ann,"valid":bool(size),"width":size[0] if size else 0,"height":size[1] if size else 0})
    splits=deterministic_split(records)
    return {"schema":"roadguard.dataset-report.v1","roadSafetyValidated":False,"root":str(rootp),"images":len(images),"annotations":sum(len(r["annotations"]) for r in records),"labels":labels,"missing_annotations":missing,"invalid":invalid,"duplicates":duplicates,"records":records,"splits":splits}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("root"); ap.add_argument("-o","--output",default="dataset-report.json"); a=ap.parse_args(); Path(a.output).write_text(json.dumps(inspect(a.root),indent=2)); print(a.output)
if __name__=="__main__": main()
