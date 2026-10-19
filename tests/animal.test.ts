import test from 'node:test';
import assert from 'node:assert/strict';
import { getAlerts, ingestObservation, priorityScore, requestRepair, requestResolution, warningDistance } from '../src/engine';
import type { Hazard, HazardType, Observation, Vehicle } from '../src/types';

const NOW = 2_000_000_000;
const observation = (patch: Partial<Observation> = {}): Observation => ({
  id: 'a', sourceId: 'camera-a', sourceType: 'dashcam', segmentId: 'road-a', direction: 1,
  offsetM: 200, confidence: 0.95, severity: 'low', observedAt: NOW, clearView: true,
  finding: 'pothole', hazardType: 'animal_on_road', ...patch,
});
const vehicle: Vehicle = { id: 'v', speedKph: 60, kind: 'car', route: [{ segmentId: 'road-a', direction: 1, lengthM: 1000 }], legIndex: 0, offsetM: 100 };
const candidate = (hazardType: HazardType = 'animal_on_road') => ingestObservation([], observation({ hazardType }), NOW);
const verified = (hazardType: HazardType = 'animal_on_road') => ingestObservation(candidate(hazardType), observation({ hazardType, id: 'b', sourceId: 'camera-b' }), NOW);

test('one animal source warns provisionally even at low severity, without injury or accident claims', () => {
  for (const type of ['animal_on_road', 'animal_incident'] as const) {
    const state = candidate(type);
    assert.equal(state[0].status, 'candidate');
    const alert = getAlerts(state, vehicle, NOW)[0];
    assert.equal(alert.provisional, true);
    assert.match(alert.message, /provisional.*unverified/i);
    assert.doesNotMatch(alert.message, /injur|death|dead|accident|emergency|reported to/i);
    if (type === 'animal_incident') assert.match(alert.message, /possible animal incident.*review required/i);
  }
});

test('animal expiry boundaries apply to alerts and priority without declaring clearance', () => {
  for (const [type, ttl] of [['animal_on_road', 60_000], ['animal_incident', 300_000]] as const) {
    const state = verified(type);
    assert.equal(getAlerts(state, vehicle, NOW + ttl).length, 1);
    assert.ok(priorityScore(state[0], NOW + ttl) > 0);
    assert.equal(getAlerts(state, vehicle, NOW + ttl + 1).length, 0);
    assert.equal(priorityScore(state[0], NOW + ttl + 1), 0);
    assert.equal(state[0].status, 'verified');
  }
});

test('types never merge or corroborate each other and missing type remains legacy pothole', () => {
  let state = ingestObservation([], observation({ hazardType: undefined }), NOW);
  state = ingestObservation(state, observation({ id: 'explicit', sourceId: 'b', hazardType: 'pothole' }), NOW);
  assert.equal(state[0].status, 'verified');
  state = ingestObservation(state, observation({ id: 'animal', sourceId: 'b' }), NOW);
  state = ingestObservation(state, observation({ id: 'incident', sourceId: 'c', hazardType: 'animal_incident' }), NOW);
  assert.equal(state.length, 3);
  assert.deepEqual(state.map(h => h.status), ['verified', 'candidate', 'candidate']);
  const unchanged = ingestObservation(state, observation({ id: 'clear', hazardType: 'pothole', finding: 'clear' }), NOW);
  assert.equal(unchanged[1].observations.length, 1);
});

test('animal corroboration requires independent sources within inclusive 30 seconds', () => {
  for (const type of ['animal_on_road', 'animal_incident'] as const) {
    for (const gap of [30_000, 30_001]) {
      const state = ingestObservation(candidate(type), observation({ hazardType: type, id: 'b', sourceId: 'camera-b', observedAt: NOW + gap }), NOW + gap);
      assert.equal(state[0].status, gap === 30_000 ? 'verified' : 'candidate');
    }
    assert.deepEqual(ingestObservation([], observation({ hazardType: type, observedAt: NOW - 30_001 }), NOW), []);
  }
});

test('stale verified animal episodes reset witnesses, severity and pending state', () => {
  for (const [type, ttl] of [['animal_on_road', 60_000], ['animal_incident', 300_000]] as const) {
    let state = requestResolution(verified(type), 'hazard:a', NOW);
    const later = NOW + ttl + 1;
    state = ingestObservation(state, observation({ id: 'new', sourceId: 'camera-c', hazardType: type, observedAt: later }), later);
    assert.equal(state[0].status, 'candidate');
    assert.equal(state[0].firstSeen, later);
    assert.equal(state[0].repairRequestedAt, undefined);
    state = ingestObservation(state, observation({ id: 'new-repeat', sourceId: 'camera-c', hazardType: type, observedAt: later + 1 }), later + 1);
    assert.equal(state[0].status, 'candidate');
    state = ingestObservation(state, observation({ id: 'new-independent', sourceId: 'camera-a', hazardType: type, observedAt: later + 2 }), later + 2);
    assert.equal(state[0].status, 'verified');
    assert.equal(state[0].observations.length, 5, 'history remains for replay protection');
  }
});

test('night warning bonus is bounded and uses vehicle or recent hazard lighting', () => {
  assert.equal(warningDistance(60, 'low', 'car', 'night'), warningDistance(60, 'low', 'car') + 60);
  assert.equal(warningDistance(200, 'critical', 'two-wheeler', 'night'), 500);
  assert.equal(warningDistance(0, 'low', 'car', 'unknown'), 100);
  const state = ingestObservation([], observation({ lighting: 'night', offsetM: 330 }), NOW);
  assert.equal(getAlerts(state, vehicle, NOW).length, 1, 'recent night evidence increases reach');
  assert.equal(getAlerts(state, vehicle, NOW + 30_001).length, 0, 'stale lighting evidence does not increase reach');
  assert.equal(getAlerts(state, { ...vehicle, lighting: 'night' }, NOW + 30_001).length, 1);
});

test('animal response is pending intent until two independent explicit fresh clear frames', () => {
  for (const type of ['animal_on_road', 'animal_incident'] as const) {
    let state = verified(type);
    assert.equal(requestRepair(state, 'hazard:a', NOW)[0].status, 'verified');
    state = requestResolution(state, 'hazard:a', NOW + 1);
    assert.equal(state[0].status, 'repair_pending');
    state = ingestObservation(state, observation({ id: 'c1', hazardType: type, finding: 'clear', observedAt: NOW + 2 }), NOW + 2);
    assert.equal(state[0].status, 'repair_pending');
    state = ingestObservation(state, observation({ id: 'c2', hazardType: type, finding: 'clear', observedAt: NOW + 3 }), NOW + 3);
    assert.equal(state[0].status, 'repair_pending', 'same identity cannot clear alone');
    state = ingestObservation(state, observation({ id: 'wrong-clear', hazardType: 'pothole', sourceId: 'other', finding: 'clear', observedAt: NOW + 4 }), NOW + 4);
    assert.equal(state[0].status, 'repair_pending');
    state = ingestObservation(state, observation({ id: 'c3', hazardType: type, sourceId: 'other', finding: 'clear', observedAt: NOW + 5 }), NOW + 5);
    assert.equal(state[0].status, 'repaired');
    assert.deepEqual(getAlerts(state, vehicle, NOW + 5), []);
    assert.equal(requestResolution(verified(type), 'hazard:a', NOW + 300_001)[0].status, 'verified', 'expired episode cannot be requested');
  }
});

test('all timestamps reject outside JavaScript Date bounds; malformed metadata and cross-type storage are rejected', () => {
  const invalidTime = 8.64e15 + 1;
  assert.throws(() => ingestObservation([], observation({ observedAt: invalidTime }), NOW));
  for (const patch of [{ firstSeen: invalidTime, lastSeen: invalidTime }, { lastSeen: invalidTime }, { repairRequestedAt: invalidTime }]) {
    assert.throws(() => priorityScore({ ...candidate()[0], ...patch }, NOW));
  }
  assert.throws(() => ingestObservation([], observation(), invalidTime));
  assert.throws(() => getAlerts([], vehicle, invalidTime));
  assert.throws(() => priorityScore(candidate()[0], invalidTime));
  assert.throws(() => requestRepair([], 'h', invalidTime));
  assert.throws(() => requestResolution([], 'h', invalidTime));
  assert.equal(ingestObservation([], observation({ observedAt: 8.64e15 }), 8.64e15).length, 1);
  for (const patch of [{ hazardType: 'deer' }, { hazardType: null }, { lighting: 'dark' }, { lighting: 1 }]) {
    assert.throws(() => ingestObservation([], observation(patch as Partial<Observation>), NOW));
    assert.throws(() => priorityScore({ ...candidate()[0], ...patch } as Hazard, NOW));
  }
  assert.throws(() => getAlerts([], { ...vehicle, lighting: 'dark' } as unknown as Vehicle, NOW));
  assert.throws(() => priorityScore({ ...candidate()[0], observations: [observation({ hazardType: 'pothole' })] }, NOW));
});
