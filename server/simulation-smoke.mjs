import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRoadguardServer } from './index.mjs';

// Explicit fixture scenario map. These offsets are NOT inferred from image pixels or real GPS.
const locations = { 'day-pothole.avi': 320, 'night-pothole.avi': 320, 'day-animal.avi': 380, 'night-animal.avi': 380, 'day-negative.avi': 700, 'night-negative.avi': 700, 'day-hard-negative.avi': 950, 'night-hard-negative.avi': 950 };
const predictions = JSON.parse(await readFile('vision/artifacts/evaluation/predictions.json', 'utf8'));
const evaluation = JSON.parse(await readFile('vision/artifacts/evaluation/results.json', 'utf8'));
if (evaluation.detector_config.trained !== false) throw new Error('This smoke test is specifically for the synthetic baseline');
const source = randomBytes(32).toString('hex'), reader = randomBytes(32).toString('hex');
const now = Date.now();
const server = createRoadguardServer({ credentials: [{ role: 'source', token: source, sourceId: 'synthetic-fixture-camera', sourceType: 'dashcam' }, { role: 'reader', token: reader }], now: () => now });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
async function request(endpoint, token, body) {
  const response = await fetch(base + endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Smoke request failed (${response.status})`);
  return data;
}
try {
  let proposals = 0, accepted = 0;
  for (const frame of predictions) {
    if (!Object.hasOwn(locations, frame.video)) throw new Error('Unknown fixture scenario');
    for (const [index, object] of frame.objects.entries()) {
      if (!['pothole', 'animal'].includes(object.class)) throw new Error('Unsupported fixture class');
      proposals++;
      const receipt = await request('/api/observations', source, {
        id: `${frame.video}:${frame.frame}:${index}`, segmentId: 'main-east', direction: 1,
        offsetM: locations[frame.video], observedAt: now, confidence: object.confidence, clearView: true,
        severity: 'high', finding: 'pothole', hazardType: object.class === 'animal' ? 'animal_on_road' : 'pothole', lighting: frame.video.startsWith('night-') ? 'night' : 'day',
      });
      if (receipt.status === 'accepted') accepted++;
    }
  }
  const snapshot = await request('/api/hazards', reader);
  if (!snapshot.hazards.length || snapshot.hazards.some(h => h.status !== 'candidate')) throw new Error('Single fixture identity must never verify');
  const vehicle = { id: 'fixture-driver', route: [{ segmentId: 'main-east', direction: 1, lengthM: 1200 }], legIndex: 0, offsetM: 150, speedKph: 60, kind: 'two-wheeler', lighting: 'night' };
  const upcoming = await request('/api/alerts', reader, vehicle);
  const offRoute = await request('/api/alerts', reader, { ...vehicle, route: [{ segmentId: 'parallel-east', direction: 1, lengthM: 1200 }] });
  if (upcoming.alerts.length !== 2 || upcoming.alerts.some(a => !a.provisional) || offRoute.alerts.length) throw new Error('Unexpected route relevance or verification');
  const report = {
    scope: 'Synthetic pixel detector -> enrolled source API -> fusion -> rider route alerts; NOT trained-model or real-road validation',
    fixtureManifestSha256: evaluation.manifest_sha256, proposals, accepted, independentSourceCount: 1,
    hazardClusters: snapshot.hazards.length, allClustersProvisional: true,
    correctRouteAlerts: upcoming.alerts.length, parallelRouteAlerts: offRoute.alerts.length,
    falsePositivePolicy: 'Night hard-negative detections retained, not hidden; they create a provisional cluster at explicit fixture offset 950 m',
    timestamps: 'All fixture observations replayed at a common synthetic capture epoch; not measured streaming latency',
    alerts: upcoming.alerts,
  };
  await mkdir('reports', { recursive: true });
  await writeFile('reports/pipeline-results.json', JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify(report, null, 2));
} finally { await server.shutdown(); }
