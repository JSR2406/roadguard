export interface GpsRouteMatcher {
  resolve(gps: { lat: number; lon: number; headingDeg: number }, routeRef?: { routeId?: string; expectedDirection?: 1 | -1 }): {
    segmentId: string; direction: 1 | -1; offsetM: number; uncertaintyM: number; headingDeg?: number;
  } | { ok: false; reason: string } | null;
}

/** Test-only deterministic east/west segment fixture. It is not a map integration. */
export class FixedSegmentMatcher implements GpsRouteMatcher {
  constructor(private readonly config: { segmentId?: string; direction?: 1 | -1; origin?: { lat: number; lon: number }; lengthM?: number; headingDeg?: number; maxDistanceM?: number } = {}) {}
  resolve(gps: { lat: number; lon: number }) {
    const direction = this.config.direction ?? 1;
    const origin = this.config.origin ?? { lat: 0, lon: 0 };
    const eastM = (gps.lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180);
    const northM = (gps.lat - origin.lat) * 110540;
    const along = direction === 1 ? eastM : -eastM;
    const cross = Math.abs(northM);
    if (cross > (this.config.maxDistanceM ?? 30) || along < 0 || along > (this.config.lengthM ?? 1000)) return { ok: false as const, reason: 'out-of-route' };
    return { segmentId: this.config.segmentId ?? 'test-segment', direction, offsetM: along, uncertaintyM: cross, headingDeg: this.config.headingDeg ?? (direction === 1 ? 0 : 180) };
  }
}
