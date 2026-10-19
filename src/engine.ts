import type { Hazard, HazardAlert, HazardType, Lighting, Observation, Severity, Vehicle } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const statuses = ['candidate', 'verified', 'repair_pending', 'repaired'];
const MAX_DATE = 8.64e15;
const typeOf = (value: { hazardType?: HazardType }) => value.hazardType ?? 'pothole';
export const hazardLabel = (value: { hazardType?: HazardType }) => typeOf(value) === 'animal_on_road' ? 'Animal on road' : typeOf(value) === 'animal_incident' ? 'Possible animal incident — review required' : 'Pothole';
const ttl = (value: { hazardType?: HazardType }) => typeOf(value) === 'animal_on_road' ? MINUTE : typeOf(value) === 'animal_incident' ? 5 * MINUTE : DAY;
const evidenceWindow = (value: { hazardType?: HazardType }) => typeOf(value) === 'pothole' ? 15 * MINUTE : 30_000;
function metadata(value: { hazardType?: unknown; lighting?: unknown }) {
  if (value.hazardType !== undefined && !['pothole', 'animal_on_road', 'animal_incident'].includes(value.hazardType as string)) throw new TypeError('Invalid hazardType');
  lighting(value.lighting);
}
function lighting(value: unknown) {
  if (value !== undefined && !['day', 'night', 'unknown'].includes(value as string)) throw new TypeError('Invalid lighting');
}
function timestamp(value: unknown, name: string, min = 0): asserts value is number {
  number(value, name, min, MAX_DATE);
}

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
}
function number(value: unknown, name: string, min = 0, max = Number.MAX_VALUE): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}`);
  }
}
function severity(value: unknown): asserts value is Severity {
  if (typeof value !== 'string' || !Object.hasOwn(severityRank, value)) throw new TypeError('Invalid severity');
}
function direction(value: unknown) {
  if (value !== 1 && value !== -1) throw new TypeError('direction must be 1 or -1');
}
function validateObservation(value: unknown): asserts value is Observation {
  object(value, 'observation');
  metadata(value);
  for (const key of ['id', 'sourceId', 'segmentId']) text(value[key], key);
  if (value.sourceType !== 'dashcam' && value.sourceType !== 'cctv') throw new TypeError('Invalid sourceType');
  direction(value.direction);
  number(value.offsetM, 'offsetM');
  number(value.confidence, 'confidence', 0, 1);
  timestamp(value.observedAt, 'observedAt');
  severity(value.severity);
  if (typeof value.clearView !== 'boolean') throw new TypeError('clearView must be boolean');
  if (value.finding !== 'pothole' && value.finding !== 'clear') throw new TypeError('Invalid finding');
}
function validateHazard(value: unknown): asserts value is Hazard {
  object(value, 'hazard');
  metadata(value);
  text(value.id, 'hazard id');
  text(value.segmentId, 'segmentId');
  direction(value.direction);
  number(value.offsetM, 'offsetM');
  severity(value.severity);
  if (!statuses.includes(value.status as string)) throw new TypeError('Invalid hazard status');
  timestamp(value.firstSeen, 'firstSeen');
  timestamp(value.lastSeen, 'lastSeen', value.firstSeen);
  if (value.repairRequestedAt !== undefined) timestamp(value.repairRequestedAt, 'repairRequestedAt');
  if (value.status === 'repair_pending' && value.repairRequestedAt === undefined) {
    throw new TypeError('Pending repair requires repairRequestedAt');
  }
  if (!Array.isArray(value.observations)) throw new TypeError('observations must be an array');
  value.observations.forEach(validateObservation);
  if (value.observations.some(item => typeOf(item) !== typeOf(value as unknown as Hazard))) throw new TypeError('Cross-hazard evidence is invalid');
}
function validateHazards(hazards: Hazard[]) {
  if (!Array.isArray(hazards)) throw new TypeError('hazards must be an array');
  const ids = new Set<string>();
  hazards.forEach(hazard => {
    validateHazard(hazard);
    if (ids.has(hazard.id)) throw new TypeError('Duplicate hazard id');
    ids.add(hazard.id);
  });
}
function usable(observation: Observation, now: number) {
  return observation.confidence >= 0.7 && observation.clearView
    && now - observation.observedAt <= evidenceWindow(observation) && observation.observedAt - now <= 5_000;
}
function matches(hazard: Hazard, observation: Observation) {
  return typeOf(hazard) === typeOf(observation) && hazard.segmentId === observation.segmentId && hazard.direction === observation.direction
    && Math.abs(hazard.offsetM - observation.offsetM) <= 15;
}
function sources(observations: Observation[]) {
  return new Set(observations.map(observation => observation.sourceId)).size;
}

/** Fuse only qualified evidence. Source identities corroborate; repeated frames never increase confidence.
 * firstSeen marks the current pothole episode; historic observations remain for replay protection.
 * lastSeen is always the latest pothole time, never a clear frame's time.
 */
export function ingestObservation(hazards: Hazard[], observation: Observation, now = Date.now()): Hazard[] {
  timestamp(now, 'now');
  validateHazards(hazards);
  validateObservation(observation);
  if (hazards.some(hazard => hazard.observations.some(item => item.id === observation.id))) return hazards;
  if (!usable(observation, now)) return hazards;
  const hazard = hazards.filter(item => matches(item, observation))
    .sort((a, b) => Math.abs(a.offsetM - observation.offsetM) - Math.abs(b.offsetM - observation.offsetM)
      || a.id.localeCompare(b.id))[0];
  if (!hazard) {
    if (observation.finding === 'clear') return hazards;
    // Observation ids are globally idempotent; a prefix provides a deterministic hazard id.
    let id = `hazard:${observation.id}`;
    while (hazards.some(item => item.id === id)) id += ':';
    return [...hazards, {
      id, segmentId: observation.segmentId, direction: observation.direction, offsetM: observation.offsetM,
      hazardType: observation.hazardType, lighting: observation.lighting,
      severity: observation.severity, status: 'candidate', observations: [{ ...observation }],
      firstSeen: observation.observedAt, lastSeen: observation.observedAt,
    }];
  }
  // Do not move the episode boundary backwards: delayed historical potholes must
  // never make pre-repair source identities eligible to corroborate a reopening.
  if (observation.finding === 'pothole' && observation.observedAt < hazard.firstSeen) return hazards;
  const observations = [...hazard.observations, { ...observation }];
  let updated: Hazard = { ...hazard, observations };
  if (observation.finding === 'pothole') {
    const expiredAnimal = typeOf(hazard) !== 'pothole' && now - hazard.lastSeen > ttl(hazard);
    if (expiredAnimal && observation.observedAt <= hazard.lastSeen) return hazards;
    if (hazard.status === 'repaired' || expiredAnimal) {
      const latestClear = Math.max(hazard.lastSeen, ...hazard.observations
        .filter(item => item.finding === 'clear').map(item => item.observedAt));
      // A late-arriving pre-repair pothole is historical evidence, not a reopening.
      if (observation.observedAt <= latestClear) return hazards;
      updated = { ...updated, firstSeen: observation.observedAt, lastSeen: observation.observedAt,
        severity: observation.severity, status: 'candidate', repairRequestedAt: undefined };
    } else {
      updated.lastSeen = Math.max(hazard.lastSeen, observation.observedAt);
      if (severityRank[observation.severity] > severityRank[hazard.severity]) updated.severity = observation.severity;
    }
    if (observation.observedAt >= hazard.lastSeen) updated.lighting = observation.lighting;
    const corroborating = observations.filter(item => item.finding === 'pothole'
      && item.observedAt >= updated.firstSeen && updated.lastSeen - item.observedAt <= evidenceWindow(updated) && matches(updated, item) && usable(item, now));
    if (updated.status === 'candidate' && sources(corroborating) >= 2) updated.status = 'verified';
  } else if (hazard.status === 'repair_pending') {
    const clear = observations.filter(item => item.finding === 'clear' && usable(item, now)
      && matches(updated, item) && item.observedAt > hazard.repairRequestedAt!
      && item.observedAt > hazard.lastSeen);
    if (sources(clear) >= 2) updated.status = 'repaired';
  }
  return hazards.map(item => item === hazard ? updated : item);
}

/** Simulation policy, not validated stopping-distance advice:
 * clamp(100 + 1.5 * speedKph + 40 * severityRank + twoWheelerBonus(50), 100, 500).
 * It is monotonic in speed, severity and two-wheeler vulnerability.
 */
export function warningDistance(speedKph: number, level: Severity, kind: Vehicle['kind'], light?: Lighting): number {
  number(speedKph, 'speedKph', 0, 200);
  severity(level);
  lighting(light);
  if (kind !== 'car' && kind !== 'two-wheeler') throw new TypeError('Invalid vehicle kind');
  return Math.min(500, Math.max(100, 100 + 1.5 * speedKph + 40 * severityRank[level] + (kind === 'two-wheeler' ? 50 : 0) + (light === 'night' ? 60 : 0)));
}

function validateVehicle(vehicle: Vehicle) {
  object(vehicle, 'vehicle');
  text(vehicle.id, 'vehicle id');
  warningDistance(vehicle.speedKph, 'low', vehicle.kind, vehicle.lighting);
  if (!Array.isArray(vehicle.route)) throw new TypeError('route must be an array');
  vehicle.route.forEach(leg => {
    object(leg, 'route leg');
    text(leg.segmentId, 'segmentId');
    direction(leg.direction);
    number(leg.lengthM, 'lengthM', Number.MIN_VALUE);
  });
  number(vehicle.legIndex, 'legIndex', 0, Math.max(0, vehicle.route.length - 1));
  if (!Number.isInteger(vehicle.legIndex)) throw new RangeError('legIndex must be an integer');
  number(vehicle.offsetM, 'offsetM', 0, vehicle.route[vehicle.legIndex]?.lengthM ?? 0);
}

/** offsetM is measured from the canonical segment start, even on reverse legs. */
export function getAlerts(hazards: Hazard[], vehicle: Vehicle, now = Date.now()): HazardAlert[] {
  timestamp(now, 'now');
  validateHazards(hazards);
  validateVehicle(vehicle);
  if (vehicle.speedKph === 0 || vehicle.route.length === 0) return [];
  const alerts: HazardAlert[] = [];
  for (const hazard of hazards) {
    if (hazard.status === 'repaired' || now - hazard.lastSeen > ttl(hazard) || hazard.lastSeen - now > 5_000) continue;
    const provisional = hazard.status === 'candidate';
    if (provisional && typeOf(hazard) === 'pothole' && severityRank[hazard.severity] < severityRank.high) continue;
    let distanceM = Infinity;
    let travelled = 0;
    for (let i = vehicle.legIndex; i < vehicle.route.length; i++) {
      const leg = vehicle.route[i];
      const start = i === vehicle.legIndex ? vehicle.offsetM : leg.direction === 1 ? 0 : leg.lengthM;
      if (hazard.segmentId === leg.segmentId && hazard.direction === leg.direction && hazard.offsetM <= leg.lengthM) {
        const along = (hazard.offsetM - start) * leg.direction;
        if (along >= 0) distanceM = Math.min(distanceM, travelled + along);
      }
      travelled += leg.direction === 1 ? leg.lengthM - start : start;
    }
    const recentNight = now - hazard.lastSeen <= evidenceWindow(hazard) && hazard.lighting === 'night';
    const warningDistanceM = warningDistance(vehicle.speedKph, hazard.severity, vehicle.kind, vehicle.lighting === 'night' || recentNight ? 'night' : vehicle.lighting);
    if (distanceM > warningDistanceM) continue;
    alerts.push({ hazardId: hazard.id, distanceM, warningDistanceM, severity: hazard.severity, provisional,
      message: `${provisional ? 'Provisional — unverified' : 'Verified evidence:'} ${hazard.severity} ${hazardLabel(hazard).toLowerCase()} ${Math.round(distanceM)} m ahead.${vehicle.kind === 'two-wheeler' ? ' Two-wheeler caution: allow extra space; avoid sudden manoeuvres.' : ' Stay attentive and allow extra space.'}` });
  }
  return alerts.sort((a, b) => a.distanceM - b.distanceM || severityRank[b.severity] - severityRank[a.severity]
    || a.hazardId.localeCompare(b.hazardId));
}

export function requestRepair(hazards: Hazard[], hazardId: string, now = Date.now()): Hazard[] {
  timestamp(now, 'now');
  validateHazards(hazards);
  text(hazardId, 'hazardId');
  return hazards.map(hazard => hazard.id === hazardId && typeOf(hazard) === 'pothole' && hazard.status === 'verified'
    ? { ...hazard, status: 'repair_pending', repairRequestedAt: now } : hazard);
}

/** A response request records intent only; independent explicit clear evidence closes it. */
export function requestResolution(hazards: Hazard[], hazardId: string, now = Date.now()): Hazard[] {
  timestamp(now, 'now');
  validateHazards(hazards);
  text(hazardId, 'hazardId');
  return hazards.map(hazard => hazard.id === hazardId && hazard.status === 'verified'
    && now - hazard.lastSeen <= ttl(hazard) && hazard.lastSeen - now <= 5_000
    ? { ...hazard, status: 'repair_pending', repairRequestedAt: now } : hazard);
}

/** Operational queue score: severity dominates, then verification and recency. Repaired/stale = 0. */
export function priorityScore(hazard: Hazard, now = Date.now()): number {
  timestamp(now, 'now');
  validateHazard(hazard);
  if (hazard.status === 'repaired' || now - hazard.lastSeen > ttl(hazard) || hazard.lastSeen - now > 5_000) return 0;
  const recency = Math.max(0, 1 - Math.max(0, now - hazard.lastSeen) / ttl(hazard));
  return (severityRank[hazard.severity] + 1) * 100
    + (hazard.status === 'candidate' ? 0 : 20) + recency * 10;
}
