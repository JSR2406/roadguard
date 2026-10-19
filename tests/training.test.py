import json, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from training.common import map_label, valid_box, deterministic_split
from training.evaluate import evaluate
from training.train import train
from training.predict import predict

class TrainingPipelineTests(unittest.TestCase):
    def test_only_d40_maps(self):
        self.assertEqual(map_label("D40"), "pothole")
        self.assertIsNone(map_label("D20")); self.assertIsNone(map_label("vehicle"))
    def test_invalid_boxes(self):
        self.assertFalse(valid_box(2, 2, 1, 4, 10, 10)); self.assertFalse(valid_box(0,0,11,2,10,10)); self.assertTrue(valid_box(0,0,1,1,10,10))
    def test_group_split_is_deterministic(self):
        rows=[{"image":f"a_frame_{i}.jpg","group":"source|country|a" if i<2 else f"g{i}"} for i in range(6)]
        a=deterministic_split(rows); b=deterministic_split(rows); self.assertEqual(a,b)
        self.assertEqual(sum(x["group"]=="source|country|a" for x in a["train"]+a["val"]+a["test"]),2)
        self.assertEqual(len({k for k,v in a.items() for x in v if x["group"]=="source|country|a"}),1)
    def test_missing_dependency_or_data_fails_closed(self):
        result=train({"permitted":False}); self.assertEqual(result["status"],"blocked")
        self.assertEqual(predict("missing-input.jpg")["status"],"blocked")
    def test_empty_predictions_and_metric_boundaries(self):
        r=evaluate([],[]); self.assertIsNone(r["precision"]); self.assertIsNone(r["recall"]); self.assertIsNone(r["f1"]); self.assertIsNone(r["ap50"])
        r=evaluate([{"image":"a","boxes":[[0,0,10,10]]}],[{"image":"a","boxes":[{"box":[0,0,10,10],"score":.9}]}]); self.assertEqual(r["f1"],1)
    def test_inspection_smoke(self):
        from training.inspect_rdd import inspect
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"x.jpg"; Image.new("RGB",(10,10)).save(p); (Path(d)/"x.xml").write_text("<annotation><size><width>10</width><height>10</height></size><object><name>D40</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>5</xmax><ymax>5</ymax></bndbox></object></annotation>")
            report=inspect(d); self.assertEqual(report["annotations"],1); self.assertFalse(report["roadSafetyValidated"])

if __name__ == "__main__": unittest.main()
