import test from 'node:test';
import assert from 'node:assert/strict';
import { getAlerts, ingestObservation, priorityScore, requestRepair, warningDistance } from '../src/engine';
import type { Hazard, Observation, Severity, Vehicle } from '../src/types';

const NOW = 2_000_000_000;
const obs = (patch: Partial<Observation> = {}): Observation => ({
  id: 'o1', sourceId: 'camera-a', sourceType: 'dashcam', segmentId: 'road-a', direction: 1,
  offsetM: 200, confidence: 0.8, severity: 'high', observedAt: NOW, clearView: true, finding: 'pothole', ...patch,
});
const hazard = (patch: Partial<Hazard> = {}): Hazard => ({
  id: 'h1', segmentId: 'road-a', direction: 1, offsetM: 200, severity: 'high', status: 'verified',
  observations: [obs()], firstSeen: NOW, lastSeen: NOW, ...patch,
});
const vehicle = (patch: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1', speedKph: 60, kind: 'car', route: [{ segmentId: 'road-a', direction: 1, lengthM: 1000 }],
  legIndex: 0, offsetM: 100, ...patch,
});
function verified(): Hazard[] {
  return ingestObservation(ingestObservation([], obs(), NOW), obs({ id: 'o2', sourceId: 'camera-b' }), NOW);
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

test('independent source identities verify; repeated frames and duplicate ids do not inflate evidence', () => {
  const first = ingestObservation([], obs(), NOW);
  const repeated = ingestObservation(frozen(first), obs({ id: 'frame2', confidence: 0.9 }), NOW);
  assert.equal(repeated[0].status, 'candidate');
  assert.equal(repeated[0].observations[0].confidence, 0.8);
  assert.equal(repeated[0].observations[1].confidence, 0.9);
  assert.strictEqual(ingestObservation(repeated, obs({ sourceId: 'different', offsetM: 900 }), NOW), repeated);
  const confirmed = ingestObservation(repeated, obs({ id: 'o2', sourceId: 'camera-b', sourceType: 'cctv' }), NOW);
  assert.equal(confirmed[0].status, 'verified');
  assert.equal(first[0].status, 'candidate');
});

test('clusters only within inclusive 15m on the same segment and direction, keeping a fixed anchor', () => {
  const original = ingestObservation([], obs(), NOW);
  for (const patch of [{ offsetM: 215.001 }, { segmentId: 'road-b' }, { direction: -1 as const }]) {
    assert.equal(ingestObservation(original, obs({ id: 'o2', sourceId: 'b', ...patch }), NOW).length, 2);
  }
  const joined = ingestObservation(original, obs({ id: 'o2', sourceId: 'b', offsetM: 215 }), NOW);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].offsetM, 200);
  assert.equal(joined[0].status, 'verified');
  assert.equal(ingestObservation(joined, obs({ id: 'o3', offsetM: 230 }), NOW).length, 2);
  assert.deepEqual(ingestObservation([], obs({ finding: 'clear' }), NOW), []);
});

test('only confident clear-view evidence within the freshness and clock-skew boundaries is accepted', () => {
  for (const patch of [
    { confidence: 0.6999 }, { clearView: false }, { observedAt: NOW - 900_001 }, { observedAt: NOW + 5001 },
  ]) assert.deepEqual(ingestObservation([], obs(patch), NOW), []);
  for (const patch of [{ confidence: 0.7 }, { observedAt: NOW - 900_000 }, { observedAt: NOW + 5000 }]) {
    assert.equal(ingestObservation([], obs(patch), NOW).length, 1);
  }
  const old = ingestObservation([], obs({ observedAt: NOW - 900_000 }), NOW);
  const next = ingestObservation(old, obs({ id: 'o2', sourceId: 'b', observedAt: NOW + 1 }), NOW + 1);
  assert.equal(next[0].status, 'candidate', 'stale supporting evidence cannot verify');
});

test('repair requires a request and two independent, fresh clear observations newer than the pothole', () => {
  let state = verified();
  const id = state[0].id;
  state = ingestObservation(state, obs({ id: 'pre', finding: 'clear', sourceId: 'c', observedAt: NOW + 1 }), NOW + 1);
  assert.equal(state[0].status, 'verified');
  state = requestRepair(frozen(state), id, NOW + 10);
  assert.equal(state[0].status, 'repair_pending');
  assert.equal(requestRepair(state, id, NOW + 20)[0].repairRequestedAt, NOW + 10);
  state = ingestObservation(state, obs({ id: 'at-request', finding: 'clear', sourceId: 'd', observedAt: NOW + 10 }), NOW + 10);
  state = ingestObservation(state, obs({ id: 'c1', finding: 'clear', sourceId: 'c', observedAt: NOW + 20 }), NOW + 20);
  state = ingestObservation(state, obs({ id: 'c2', finding: 'clear', sourceId: 'c', observedAt: NOW + 30 }), NOW + 30);
  assert.equal(state[0].status, 'repair_pending');
  state = ingestObservation(state, obs({ id: 'new-hole', sourceId: 'd', observedAt: NOW + 40 }), NOW + 40);
  state = ingestObservation(state, obs({ id: 'c3', finding: 'clear', sourceId: 'e', observedAt: NOW + 50 }), NOW + 50);
  assert.equal(state[0].status, 'repair_pending', 'clear frames before latest pothole cannot close repair');
  state = ingestObservation(state, obs({ id: 'c4', finding: 'clear', sourceId: 'f', observedAt: NOW + 60 }), NOW + 60);
  assert.equal(state[0].status, 'repaired');
  assert.equal(state[0].lastSeen, NOW + 40);
  assert.deepEqual(getAlerts(state, vehicle(), NOW + 60), []);
  const repaired = state;
  state = ingestObservation(state, obs({ id: 'late-old', observedAt: NOW + 45 }), NOW + 70);
  assert.strictEqual(state, repaired);
  state = ingestObservation(state, obs({ id: 'reopen', severity: 'low', observedAt: NOW + 70 }), NOW + 70);
  assert.equal(state[0].status, 'candidate');
  assert.equal(state[0].severity, 'low');
  assert.equal(state[0].firstSeen, NOW + 70);
  assert.equal(state[0].repairRequestedAt, undefined);
  const reopened = state;
  state = ingestObservation(state, obs({ id: 'delayed-historic', sourceId: 'historic-source', observedAt: NOW + 1 }), NOW + 70);
  assert.strictEqual(state, reopened, 'late historical observations cannot move the reopening boundary backwards');
  assert.strictEqual(ingestObservation(state, obs({ id: 'o2', sourceId: 'camera-b' }), NOW + 70), state);
  state = ingestObservation(state, obs({ id: 'reopen-frame', observedAt: NOW + 71 }), NOW + 71);
  assert.equal(state[0].status, 'candidate');
  state = ingestObservation(state, obs({ id: 'reopen-independent', sourceId: 'b', observedAt: NOW + 72 }), NOW + 72);
  assert.equal(state[0].status, 'verified');
});

test('unqualified or stale clear evidence cannot confirm repair, and candidate repair requests do nothing', () => {
  const candidate = ingestObservation([], obs(), NOW);
  assert.equal(requestRepair(candidate, candidate[0].id, NOW)[0].status, 'candidate');
  let state = requestRepair(verified(), 'hazard:o1', NOW);
  state = ingestObservation(state, obs({ id: 'clear-a', finding: 'clear', observedAt: NOW + 1 }), NOW + 1);
  state = ingestObservation(state, obs({ id: 'clear-bad', sourceId: 'b', finding: 'clear', clearView: false, observedAt: NOW + 2 }), NOW + 2);
  state = ingestObservation(state, obs({ id: 'clear-b', sourceId: 'b', finding: 'clear', observedAt: NOW + 900_002 }), NOW + 900_002);
  assert.equal(state[0].status, 'repair_pending');
  assert.equal(requestRepair(state, 'missing', NOW)[0].status, 'repair_pending');
});

test('warning policy is finite, bounded and monotonic across speed, severity and vehicle kind', () => {
  const levels: Severity[] = ['low', 'medium', 'high', 'critical'];
  for (let speed = 0; speed <= 200; speed++) {
    for (let s = 0; s < levels.length; s++) {
      const car = warningDistance(speed, levels[s], 'car');
      const bike = warningDistance(speed, levels[s], 'two-wheeler');
      assert.ok(car >= 100 && bike <= 500 && bike >= car);
      if (speed) assert.ok(car >= warningDistance(speed - 1, levels[s], 'car'));
      if (s) assert.ok(car >= warningDistance(speed, levels[s - 1], 'car'));
    }
  }
  assert.equal(warningDistance(0, 'low', 'car'), 100);
  assert.equal(warningDistance(200, 'critical', 'two-wheeler'), 500);
});

test('alerts exclude behind/off-route/wrong direction, repaired, stale and low-confidence candidates', () => {
  const list = [
    hazard(), hazard({ id: 'behind', offsetM: 99 }), hazard({ id: 'off-route', segmentId: 'elsewhere' }),
    hazard({ id: 'reverse', direction: -1 }), hazard({ id: 'repaired', status: 'repaired' }),
    hazard({ id: 'old', firstSeen: NOW - 86_400_001, lastSeen: NOW - 86_400_001 }),
    hazard({ id: 'future', firstSeen: NOW + 5001, lastSeen: NOW + 5001 }),
    hazard({ id: 'low', status: 'candidate', severity: 'low' }),
    hazard({ id: 'medium', status: 'candidate', severity: 'medium' }),
    hazard({ id: 'provisional', status: 'candidate' }),
    hazard({ id: 'critical', status: 'candidate', severity: 'critical' }),
    hazard({ id: 'pending', status: 'repair_pending', repairRequestedAt: NOW }),
  ];
  const alerts = getAlerts(frozen(list), frozen(vehicle()), NOW);
  assert.deepEqual(new Set(alerts.map(alert => alert.hazardId)), new Set(['h1', 'provisional', 'critical', 'pending']));
  const provisional = alerts.find(alert => alert.hazardId === 'provisional')!;
  assert.equal(provisional.provisional, true);
  assert.match(provisional.message, /provisional.*unverified/i);
  assert.equal(alerts.find(alert => alert.hazardId === 'h1')!.provisional, false);
  assert.match(getAlerts([hazard()], vehicle({ kind: 'two-wheeler' }), NOW)[0].message, /two-wheeler/i);
  assert.deepEqual(getAlerts(list, vehicle({ speedKph: 0 }), NOW), []);
  assert.deepEqual(getAlerts(list, vehicle({ route: [], offsetM: 0 }), NOW), []);
  assert.equal(getAlerts([hazard({ firstSeen: NOW - 86_400_000, lastSeen: NOW - 86_400_000 })], vehicle(), NOW).length, 1);
});

test('directed route distances use canonical offsets, leg bounds and full intervening legs', () => {
  const route: Vehicle['route'] = [
    { segmentId: 'road-a', direction: -1, lengthM: 1000 },
    { segmentId: 'connector', direction: 1, lengthM: 50 },
    { segmentId: 'road-b', direction: -1, lengthM: 300 },
  ];
  const v = vehicle({ route, offsetM: 100, speedKph: 200, kind: 'two-wheeler' });
  const alerts = getAlerts([
    hazard({ id: 'here', direction: -1, offsetM: 100 }),
    hazard({ id: 'ahead', direction: -1, offsetM: 20 }),
    hazard({ id: 'behind', direction: -1, offsetM: 101 }),
    hazard({ id: 'end', direction: -1, offsetM: 0 }),
    hazard({ id: 'next-start', segmentId: 'connector', offsetM: 0 }),
    hazard({ id: 'out-of-leg', segmentId: 'connector', offsetM: 51 }),
    hazard({ id: 'reverse-entry', segmentId: 'road-b', direction: -1, offsetM: 300 }),
    hazard({ id: 'reverse-end', segmentId: 'road-b', direction: -1, offsetM: 0 }),
    hazard({ id: 'reverse-out', segmentId: 'road-b', direction: -1, offsetM: 301 }),
  ], v, NOW);
  assert.deepEqual(alerts.map(a => [a.hazardId, a.distanceM]), [
    ['here', 0], ['ahead', 80], ['end', 100], ['next-start', 100], ['reverse-entry', 150], ['reverse-end', 450],
  ]);
  const forward = vehicle({ speedKph: 200, kind: 'two-wheeler' });
  const threshold = warningDistance(200, 'high', 'two-wheeler');
  assert.equal(getAlerts([hazard({ offsetM: 100 + threshold })], forward, NOW).length, 1);
  assert.equal(getAlerts([hazard({ offsetM: 100 + threshold + 0.001 })], forward, NOW).length, 0);
  assert.equal(getAlerts([hazard({ offsetM: 1000 })], vehicle({ offsetM: 900 }), NOW)[0].distanceM, 100);
  assert.deepEqual(getAlerts([hazard({ offsetM: 1001 })], vehicle({ offsetM: 900 }), NOW), []);
  assert.deepEqual(getAlerts([hazard({ segmentId: 'road-a' })], vehicle({ route, legIndex: 2, offsetM: 300 }), NOW), []);
});

test('repeated route segments use the nearest forward occurrence', () => {
  const v = vehicle({ offsetM: 250, route: [
    { segmentId: 'road-a', direction: 1, lengthM: 300 },
    { segmentId: 'road-a', direction: 1, lengthM: 300 },
  ] });
  assert.equal(getAlerts([hazard()], v, NOW)[0].distanceM, 250);
});

test('priority is deterministic, severity-led and excludes stale or repaired hazards', () => {
  assert.ok(priorityScore(hazard({ severity: 'critical', status: 'candidate' }), NOW)
    > priorityScore(hazard({ severity: 'high' }), NOW));
  assert.ok(priorityScore(hazard(), NOW) > priorityScore(hazard({ status: 'candidate' }), NOW));
  assert.equal(priorityScore(hazard({ status: 'repaired' }), NOW), 0);
  assert.equal(priorityScore(hazard({ firstSeen: 0, lastSeen: 0 }), NOW), 0);
  assert.ok(priorityScore(hazard(), NOW) > priorityScore(hazard(), NOW + 1000));
});

test('rejects malformed observation values, arrays, timestamps, severities and kinds', () => {
  const bad: Record<string, unknown>[] = [
    { id: '' }, { sourceId: '  ' }, { sourceType: 'phone' }, { segmentId: 2 }, { direction: 0 },
    { offsetM: -1 }, { offsetM: Infinity }, { confidence: NaN }, { confidence: 1.1 }, { confidence: -1 },
    { severity: '__proto__' }, { observedAt: -1 }, { observedAt: Infinity }, { clearView: 'yes' }, { finding: 'unknown' },
  ];
  for (const patch of bad) assert.throws(() => ingestObservation([], obs(patch as Partial<Observation>), NOW));
  assert.throws(() => ingestObservation(null as unknown as Hazard[], obs(), NOW));
  assert.throws(() => ingestObservation([], null as unknown as Observation, NOW));
  for (const speed of [NaN, Infinity, -1, 201, '60' as unknown as number]) {
    assert.throws(() => warningDistance(speed, 'high', 'car'));
  }
  assert.throws(() => warningDistance(60, 'constructor' as Severity, 'car'));
  assert.throws(() => warningDistance(60, 'high', 'truck' as Vehicle['kind']));
  for (const now of [NaN, Infinity, -1]) {
    assert.throws(() => ingestObservation([], obs(), now));
    assert.throws(() => getAlerts([], vehicle(), now));
    assert.throws(() => requestRepair([], 'h1', now));
    assert.throws(() => priorityScore(hazard(), now));
  }
});

test('rejects malformed hazards and route positions even when stationary or no alerts exist', () => {
  const invalidHazards = [
    { offsetM: NaN }, { status: 'unknown' }, { status: 'repair_pending' }, { observations: null },
    { firstSeen: NOW + 1 }, { lastSeen: -1 }, { repairRequestedAt: Infinity }, { direction: 0 },
  ];
  for (const patch of invalidHazards) {
    const h = hazard(patch as Partial<Hazard>);
    assert.throws(() => getAlerts([h], vehicle({ speedKph: 0 }), NOW));
    assert.throws(() => requestRepair([h], 'h1', NOW));
    assert.throws(() => priorityScore(h, NOW));
  }
  assert.throws(() => getAlerts([hazard(), hazard()], vehicle(), NOW));
  for (const patch of [
    { speedKph: NaN }, { kind: 'truck' }, { offsetM: -1 }, { offsetM: 1001 },
    { legIndex: -1 }, { legIndex: 1 }, { legIndex: 0.5 }, { route: null },
    { route: [{ segmentId: 'road-a', direction: 0, lengthM: 1000 }] },
    { route: [{ segmentId: 'road-a', direction: 1, lengthM: 0 }] },
    { route: [{ segmentId: 'road-a', direction: 1, lengthM: Infinity }] },
  ]) assert.throws(() => getAlerts([], vehicle(patch as Partial<Vehicle>), NOW));
  assert.throws(() => requestRepair([], '', NOW));
});
