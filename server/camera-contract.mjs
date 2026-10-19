const HAZARDS = new Set(['pothole', 'animal_on_road', 'animal_incident']);
const LIGHTING = new Set(['day', 'night', 'unknown']);
const SOURCES = new Set(['dashcam', 'cctv']);
const ENVELOPE_FIELDS = new Set(['version', 'deviceId', 'sourceId', 'sourceType', 'captureTime', 'receiveTime', 'frameId', 'hazardType', 'lighting', 'confidence', 'clearView', 'cameraPosition', 'gps', 'routeRef']);
const GPS_FIELDS = new Set(['lat', 'lon', 'accuracyM', 'headingDeg', 'speedKph', 'timestamp']);
const CAMERA_FIELDS = new Set(['mount', 'fovDeg']);
const ROUTE_FIELDS = new Set(['routeId', 'expectedDirection']);
const severityFor = { pothole: 'medium', animal_on_road: 'high', animal_incident: 'critical' };
const fail = (reason, details = {}) => ({ ok: false, reason, ...details });
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v, max = 160) => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
const exact = (v, allowed) => object(v) && Object.keys(v).every(k => allowed.has(k));

/** Validate a versioned, strict JSON-line envelope. Times are Unix epoch milliseconds. */
export function validateCameraEnvelope(value, { now = Date.now(), maxSkewMs = 30_000, maxAgeMs = 120_000 } = {}) {
  if (!object(value)) return fail('malformed-envelope');
  if (!exact(value, ENVELOPE_FIELDS)) return fail('unknown-field');
  for (const key of ['deviceId', 'sourceId', 'frameId']) if (!text(value[key])) return fail(`invalid-${key}`);
  if (value.version !== 1) return fail('unsupported-version');
  if (!SOURCES.has(value.sourceType)) return fail('invalid-sourceType');
  if (!HAZARDS.has(value.hazardType)) return fail('invalid-hazardType');
  if (!LIGHTING.has(value.lighting) || !finite(value.confidence, 0, 1) || typeof value.clearView !== 'boolean') return fail('invalid-observation-fields');
  if (!finite(value.captureTime, 0, 8.64e15) || !finite(value.receiveTime, 0, 8.64e15)) return fail('invalid-timestamp');
  if (Math.abs(value.receiveTime - value.captureTime) > maxSkewMs) return fail('timestamp-skew');
  if (value.receiveTime > now + maxSkewMs || now - value.receiveTime > maxAgeMs) return fail('stale-envelope');
  if (value.cameraPosition !== undefined && (!exact(value.cameraPosition, CAMERA_FIELDS) || !text(value.cameraPosition.mount, 40) || !finite(value.cameraPosition.fovDeg, 1, 360))) return fail('invalid-cameraPosition');
  if (value.routeRef !== undefined && (!exact(value.routeRef, ROUTE_FIELDS) || !text(value.routeRef.routeId, 160) || (value.routeRef.expectedDirection !== undefined && ![1, -1].includes(value.routeRef.expectedDirection)))) return fail('invalid-routeRef');
  if (value.gps !== undefined) {
    const gps = value.gps;
    if (!exact(gps, GPS_FIELDS) || !finite(gps.lat, -90, 90) || !finite(gps.lon, -180, 180) || !finite(gps.accuracyM, 0, 10000) || !finite(gps.headingDeg, 0, 360) || !finite(gps.speedKph, 0, 400) || !finite(gps.timestamp, 0, 8.64e15)) return fail('invalid-gps');
    if (Math.abs(value.receiveTime - gps.timestamp) > maxSkewMs || now - gps.timestamp > maxAgeMs) return fail('stale-gps');
  }
  return { ok: true, envelope: value };
}

/** Matcher contract: resolve GPS to a directed segment, offset, and cross-track uncertainty. */
export function convertEnvelope(value, { matcher, seenFrameIds = new Set(), now = Date.now(), maxSkewMs = 30_000, maxAgeMs = 120_000, maxGpsAccuracyM = 25, maxRouteUncertaintyM = 30, maxHeadingDeltaDeg = 45 } = {}) {
  const checked = validateCameraEnvelope(value, { now, maxSkewMs, maxAgeMs });
  if (!checked.ok) return checked;
  const e = checked.envelope;
  const key = `${e.sourceId}:${e.frameId}`;
  if (seenFrameIds.has(key)) return fail('duplicate-frame');
  if (!e.gps) return fail('gps-required');
  if (e.gps.accuracyM > maxGpsAccuracyM) return fail('poor-gps-accuracy');
  if (!matcher || typeof matcher.resolve !== 'function') return fail('route-matcher-required');
  const match = matcher.resolve(e.gps, e.routeRef);
  if (!match || match.ok === false) return fail(match?.reason ?? 'out-of-route');
  if (![1, -1].includes(match.direction) || !text(match.segmentId) || !finite(match.offsetM, 0, Number.MAX_SAFE_INTEGER)) return fail('invalid-route-match');
  if (!finite(match.uncertaintyM, 0, maxRouteUncertaintyM)) return fail('route-uncertainty');
  if (e.routeRef?.expectedDirection !== undefined && e.routeRef.expectedDirection !== match.direction) return fail('wrong-direction');
  const delta = Math.abs(((e.gps.headingDeg - (match.headingDeg ?? (match.direction === 1 ? 0 : 180)) + 540) % 360) - 180);
  if (delta > maxHeadingDeltaDeg) return fail('wrong-heading');
  seenFrameIds.add(key);
  return { ok: true, observation: { id: e.frameId, sourceId: e.sourceId, sourceType: e.sourceType, segmentId: match.segmentId, direction: match.direction, offsetM: match.offsetM, confidence: e.confidence, severity: severityFor[e.hazardType], observedAt: e.captureTime, clearView: e.clearView, finding: e.clearView ? 'pothole' : 'clear', hazardType: e.hazardType, lighting: e.lighting } };
}
