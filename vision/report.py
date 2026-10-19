"""Build a portable evidence gallery; it never hides synthetic false positives."""
import base64
import html
import json
from pathlib import Path
import cv2


def render_report(root=Path('.')):
    root = Path(root)
    evaluation = root/'vision/artifacts/evaluation'
    result = json.loads((evaluation/'results.json').read_text())
    predictions = json.loads((evaluation/'predictions.json').read_text())
    cards = []
    for name in ['day-pothole', 'night-pothole', 'day-animal', 'night-animal']:
        image = base64.b64encode((evaluation/f'{name}-0012.jpg').read_bytes()).decode()
        cards.append(f'<figure><img alt="Synthetic {html.escape(name)} detector overlay" src="data:image/jpeg;base64,{image}"><figcaption>{html.escape(name)} — procedural fixture</figcaption></figure>')
    false_positive = next((frame for frame in predictions if 'hard-negative' in frame['video'] and frame['objects']), None)
    if false_positive:
        capture = cv2.VideoCapture(str(root/'vision/artifacts/fixtures'/false_positive['video']))
        try:
            capture.set(cv2.CAP_PROP_POS_FRAMES, false_positive['frame'])
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Cannot decode false-positive evidence frame')
            for obj in false_positive['objects']:
                x1, y1, x2, y2 = map(round, obj['bbox'])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            ok, encoded = cv2.imencode('.jpg', frame)
            if not ok:
                raise ValueError('Cannot encode false-positive preview')
            image = base64.b64encode(encoded).decode()
            cards.append(f'<figure class="failure"><img alt="False positive on a synthetic night hard negative" src="data:image/jpeg;base64,{image}"><figcaption>Known failure: {html.escape(false_positive["video"])} frame {false_positive["frame"]} — red box is a false positive</figcaption></figure>')
        finally:
            capture.release()
    overall = result['overall']
    document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoadGuard simulation evidence</title>
<style>body{{font:16px system-ui;background:#f3f6f8;color:#172a3b;margin:0;padding:32px;line-height:1.6}}main{{max-width:1100px;margin:auto}}.notice{{background:#fff0cf;border-left:5px solid #a15a00;padding:18px}}.metrics,.gallery{{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}}.metrics div,figure{{background:white;border:1px solid #ccd6df;padding:20px;border-radius:10px}}.metrics strong{{font-size:28px;display:block}}figure{{margin:0;flex:1 1 320px}}img{{width:100%;max-width:480px;image-rendering:auto}}figcaption{{margin-top:12px}}.failure{{border:2px solid #bd2727}}code{{overflow-wrap:anywhere}}@media(max-width:500px){{body{{padding:16px}}}}</style>
<main><p>ROADGUARD / TEST EVIDENCE</p><h1>Simulation results, including failures</h1><div class="notice"><strong>Not a trained AI model. Not real-road validation.</strong> These are original 320×240 procedural road drawings. Night means reduced brightness, not realistic night capture. This gallery demonstrates video decoding, bounding boxes and evaluation, not production accuracy.</div>
<div class="metrics"><div><strong>{overall['frames']}</strong>frames / 8 videos</div><div><strong>{overall['tp']}</strong>true positives</div><div><strong>{overall['fp']}</strong>false positives</div><div><strong>{overall['fn']}</strong>false negatives</div></div>
<p>Fixture precision: {overall['precision']:.2%}; recall: {overall['recall']:.2%} at IoU ≥0.5. All three false positives occur in night hard negatives. Adjacent frames are correlated; these scores are not an independent road trial.</p>
<div class="gallery">{''.join(cards)}</div><h2>What was cross-validated?</h2><p>Separate drawing geometry provides ground-truth boxes. The rule-based detector receives decoded pixels only. Predictions were then replayed through the authenticated API using one synthetic source identity: every cluster stayed provisional, two relevant route warnings were returned and the parallel route returned none. False positives were retained rather than discarded.</p>
<p>No collision, injury, death, physical depth, GPS localisation or physical camera independence was inferred. Trained ONNX inference requires a permitted trained model and independent real footage.</p>
<p>Fixture manifest SHA-256: <code>{html.escape(result['manifest_sha256'])}</code></p></main></html>'''
    destination = root/'reports/simulation-preview.html'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(document, encoding='utf-8')
    return destination


if __name__ == '__main__':
    print(render_report())
