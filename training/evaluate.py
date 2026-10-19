from __future__ import annotations
import argparse,csv,json
from pathlib import Path

def iou(a,b):
    x1=max(a[0],b[0]); y1=max(a[1],b[1]); x2=min(a[2],b[2]); y2=min(a[3],b[3]); inter=max(0,x2-x1)*max(0,y2-y1)
    area=lambda x:max(0,x[2]-x[0])*max(0,x[3]-x[1]); den=area(a)+area(b)-inter
    return inter/den if den else 0.0

def evaluate(ground_truth: list[dict], predictions: list[dict], iou_threshold=.5) -> dict:
    gt={(x["image"],x.get("label","pothole")):x.get("boxes",[]) for x in ground_truth}; matched=0; fp=0; total=sum(len(v) for v in gt.values()); pr=[]
    for row in predictions:
        key=(row["image"],row.get("label","pothole")); used=set()
        for box in sorted(row.get("boxes",[]),key=lambda b:b.get("score",0),reverse=True):
            best=max((iou(box["box"], g) for i,g in enumerate(gt.get(key,[])) if i not in used),default=0)
            if best>=iou_threshold: matched+=1
            else: fp+=1
            pr.append({"image":row["image"],"score":box.get("score"),"iou":best,"matched":best>=iou_threshold})
    fn=max(0,total-matched); precision=matched/(matched+fp) if matched+fp else None; recall=matched/total if total else None; f1=2*precision*recall/(precision+recall) if precision is not None and recall is not None and precision+recall else None
    ap50=precision*recall if precision is not None and recall is not None else None
    return {"roadSafetyValidated":False,"precision":precision,"recall":recall,"f1":f1,"ap50":ap50,"map50":ap50,"true_positive":matched,"false_positive":fp,"false_negative":fn,"pr_data":pr,"classes":{"pothole":{"precision":precision,"recall":recall}}}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("ground_truth"); ap.add_argument("predictions"); ap.add_argument("-o","--output",default="evaluation.json"); a=ap.parse_args()
    result=evaluate(json.loads(Path(a.ground_truth).read_text()),json.loads(Path(a.predictions).read_text())); Path(a.output).write_text(json.dumps(result,indent=2)); Path(a.output).with_suffix(".csv").write_text("image,score,iou,matched\n"+"\n".join(f'{x["image"]},{x["score"]},{x["iou"]},{x["matched"]}' for x in result["pr_data"]))
if __name__=="__main__": main()
