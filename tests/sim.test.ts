import assert from 'node:assert/strict';
import test from 'node:test';
import { replayCameraEvidence, simulateWarnings, validateCarlaScenario, validateSumoScenario } from '../sim/index';
import type { DirectedHazard, SimVehicle } from '../sim/index';

const obs = (id: string, sourceId: string, finding: 'pothole' | 'clear', observedAt: number, offsetM = 200) => ({ id, sourceId, sourceType: 'dashcam' as const, segmentId: 'A', direction: 1 as const, offsetM, confidence: .95, severity: 'high' as const, observedAt, clearView: true, finding });
const hazard: DirectedHazard = { id: 'h1', segmentId: 'A', direction: 1, offsetM: 200, severity: 'high', status: 'verified', observations: [obs('o1', 'cam1', 'pothole', 0), obs('o2', 'cam2', 'pothole', 0)], firstSeen: 0, lastSeen: 0 };
const vehicle = (id: string, speedKph: number, direction: 1 | -1 = 1, extra: Partial<SimVehicle> = {}): SimVehicle => ({ id, speedKph, kind: 'car', route: [{ segmentId: 'A', direction, lengthM: 1000 }], legIndex: 0, offsetM: 0, connection: 'online', gpsErrorM: 0, ...extra });

test('20/40/60/100 km/h produce deterministic warnings inside engine distance', () => {
  const result = simulateWarnings({ now: 1, hazards: [hazard], vehicles: [20, 40, 60, 100].map(s => vehicle(String(s), s)) });
  assert.deepEqual(result.warnings.map(w => w.alerts.length), [1, 1, 1, 1]);
  assert.deepEqual(result.warnings.map(w => w.alerts[0].warningDistanceM), [210, 240, 270, 330]);
});

test('opposite carriageway is excluded', () => {
  const result = simulateWarnings({ now: 1, hazards: [hazard], vehicles: [vehicle('same', 60, 1), vehicle('opposite', 60, -1)] });
  assert.equal(result.warnings.find(w => w.vehicleId === 'same')!.alerts.length, 1);
  assert.equal(result.warnings.find(w => w.vehicleId === 'opposite')!.alerts.length, 0);
});

test('latency, offline cache, and inaccurate GPS are deterministic', () => {
  const delayed = simulateWarnings({ now: 1000, messageLatencyMs: 200, hazards: [hazard], vehicles: [vehicle('v', 60)], reports: [{ id: 'r', vehicleId: 'v', kind: 'hazard', createdAt: 900, messageLatencyMs: 200, delivered: false }] });
  assert.equal(delayed.deliveredReports.length, 0);
  const cached = simulateWarnings({ now: 1000, hazards: [hazard], vehicles: [vehicle('offline', 60, 1, { connection: 'offline' }), vehicle('bad-gps', 60, 1, { gpsErrorM: 26 })] });
  assert.equal(cached.warnings[0].cached, true); assert.equal(cached.warnings[0].alerts.length, 1); assert.equal(cached.warnings[1].alerts.length, 0);
});

test('multi-camera fusion verifies, ignores duplicates/stale evidence, and repairs', () => {
  const verified = replayCameraEvidence({ now: 1000, observations: [obs('a', 'cam1', 'pothole', 900), obs('a', 'cam1', 'pothole', 900), obs('b', 'cam2', 'pothole', 900)] });
  assert.equal(verified.hazards[0].status, 'verified'); assert.deepEqual(verified.duplicateReports, ['a']);
  const pending = { ...verified.hazards[0], status: 'repair_pending' as const, repairRequestedAt: 950 };
  const repaired = replayCameraEvidence({ now: 1000, initialHazards: [pending], observations: [obs('c', 'cam1', 'clear', 980), obs('d', 'cam2', 'clear', 990)] });
  assert.equal(repaired.hazards[0].status, 'repaired'); assert.equal(repaired.safetyValidated, false);
});

test('CARLA and SUMO-like manifests validate', () => {
  assert.equal(validateCarlaScenario({ cameras: [{ id: 'front', width: 1920, height: 1080, fov: 90 }], gps: { enabled: true, errorM: 2 }, imu: { enabled: true, noise: .1 }, weather: 'clear', lighting: 'day' }), true);
  assert.equal(validateCarlaScenario({ cameras: [], gps: { enabled: true, errorM: -1 }, imu: { enabled: true, noise: 0 }, weather: 'clear', lighting: 'day' }), false);
  assert.equal(validateSumoScenario({ networkId: 'net', seed: 7, durationS: 60, routes: [{ vehicleId: 'v', edges: ['e1'], departS: 0, speedKph: 40 }] }), true);
  assert.equal(validateSumoScenario({ networkId: 'net', seed: 7, durationS: 0, routes: [] }), false);
});
