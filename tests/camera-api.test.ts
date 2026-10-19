import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRoadguardServer } from '../server/index.mjs';
import { FixedSegmentMatcher } from '../adapter/gps-route-matcher';

const now = 1_800_000_000_000;
const reader = 'reader-camera-api-0123456789-abcdefghijklmnopqrstuvwxyz';
const source = 'source-camera-api-0123456789-abcdefghijklmnopqrstuvwxyz';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' });

test('authenticated NDJSON camera ingestion converts GPS through matcher and exposes safe metrics', async t => {
  const server = createRoadguardServer({ credentials: [{ role: 'reader', token: reader }, { role: 'source', token: source, sourceId: 'camera-one', sourceType: 'dashcam' }], now: () => now, cameraMatcher: new FixedSegmentMatcher({ segmentId: 'main-east', lengthM: 1200 }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.shutdown());
  const port = (server.address() as { port: number }).port; const base = `http://127.0.0.1:${port}`;
  const envelope = { version: 1, deviceId: 'vehicle-one', sourceId: 'camera-one', sourceType: 'dashcam', captureTime: now, receiveTime: now, frameId: 'frame-1', hazardType: 'animal_on_road', lighting: 'night', confidence: .95, clearView: true, gps: { lat: 0, lon: 200 / 111320, accuracyM: 4, headingDeg: 0, speedKph: 40, timestamp: now }, routeRef: { routeId: 'pilot-main', expectedDirection: 1 } };
  const first = await fetch(`${base}/integration/camera/observations`, { method: 'POST', headers: headers(source), body: JSON.stringify(envelope) + '\n' });
  assert.equal(first.status, 200); assert.equal((await first.json()).receipts[0].status, 'accepted');
  const replay = await fetch(`${base}/integration/camera/observations`, { method: 'POST', headers: headers(source), body: JSON.stringify(envelope) + '\n' });
  assert.equal((await replay.json()).receipts[0].status, 'replayed');
  const hazards = await fetch(`${base}/api/hazards`, { headers: { Authorization: `Bearer ${reader}` } });
  const snapshot = await hazards.json(); assert.equal(snapshot.hazards.length, 1); assert.equal(snapshot.hazards[0].hazardType, 'animal_on_road');
  const metrics = await fetch(`${base}/api/metrics`, { headers: { Authorization: `Bearer ${reader}` } });
  const body = await metrics.json(); assert.equal(body.cameraRecords, 2); assert.equal(body.cameraAccepted, 1); assert.equal(body.roadSafetyValidated, false); assert.equal(JSON.stringify(body).includes(source), false);
});

test('camera ingestion fails closed when no route matcher is configured', async t => {
  const server = createRoadguardServer({ credentials: [{ role: 'source', token: source, sourceId: 'camera-one', sourceType: 'dashcam' }], now: () => now });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.shutdown());
  const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/integration/camera/observations`, { method: 'POST', headers: headers(source), body: '{}\n' });
  assert.equal(response.status, 503);
});
