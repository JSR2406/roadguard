export type MapProviderId = 'osm-maplibre' | 'mapbox' | 'here' | 'google' | 'tomtom';
export type MapProviderStatus = 'not-configured' | 'configured-not-verified' | 'verified-for-pilot';

export interface MapProviderProfile {
  id: MapProviderId;
  name: string;
  status: MapProviderStatus;
  requiresApiKey: boolean;
  attribution: string;
  routing: boolean;
  mapMatching: boolean;
  vehicleTermsReviewRequired: boolean;
  tileTermsReviewRequired: boolean;
  notes: string;
}

export const MAP_PROVIDER_PROFILES: readonly MapProviderProfile[] = [
  { id: 'osm-maplibre', name: 'OpenStreetMap + MapLibre + self-hosted OSRM/GraphHopper', status: 'not-configured', requiresApiKey: false, attribution: '© OpenStreetMap contributors', routing: true, mapMatching: true, vehicleTermsReviewRequired: false, tileTermsReviewRequired: true, notes: 'Recommended pilot default. Self-host tiles/routing; ODbL data and tile-policy review required.' },
  { id: 'mapbox', name: 'Mapbox', status: 'not-configured', requiresApiKey: true, attribution: 'Mapbox attribution required', routing: true, mapMatching: true, vehicleTermsReviewRequired: true, tileTermsReviewRequired: true, notes: 'Evaluate only after confirming vehicle-application licence and usage pricing.' },
  { id: 'here', name: 'HERE', status: 'not-configured', requiresApiKey: true, attribution: 'HERE attribution/terms required', routing: true, mapMatching: true, vehicleTermsReviewRequired: true, tileTermsReviewRequired: true, notes: 'Commercial comparison candidate; confirm India coverage, traffic, caching and contract.' },
  { id: 'google', name: 'Google Maps Platform', status: 'not-configured', requiresApiKey: true, attribution: 'Google attribution required', routing: true, mapMatching: true, vehicleTermsReviewRequired: true, tileTermsReviewRequired: true, notes: 'Do not mix Google content with other map bases or use Google content for model training; review vehicle restrictions.' },
  { id: 'tomtom', name: 'TomTom', status: 'not-configured', requiresApiKey: true, attribution: 'TomTom attribution/terms required', routing: true, mapMatching: true, vehicleTermsReviewRequired: true, tileTermsReviewRequired: true, notes: 'Commercial comparison candidate; confirm Pune coverage, traffic freshness, quotas and derived-data rights.' },
];

export interface RouteProvider {
  route(request: { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number } }): Promise<{ provider: MapProviderId; routeId: string; geometry: unknown; attribution: string }>;
  match(request: { latitude: number; longitude: number; headingDeg?: number }): Promise<{ provider: MapProviderId; segmentId: string; direction: 1 | -1; offsetM: number; uncertaintyM: number }>;
}

export function selectPilotProvider(id: MapProviderId): MapProviderProfile {
  const profile = MAP_PROVIDER_PROFILES.find(item => item.id === id);
  if (!profile) throw new RangeError(`Unknown map provider: ${id}`);
  if (profile.status !== 'verified-for-pilot') throw new Error(`${profile.name} is not configured or licence-verified for this pilot`);
  return profile;
}
