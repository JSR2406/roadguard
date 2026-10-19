export type GpsState = { status: 'idle' | 'watching' | 'denied' | 'unavailable' | 'error'; latitude?: number; longitude?: number; accuracyM?: number; headingDeg?: number; speedKph?: number; message?: string };
export type CameraCapability = { status: 'available' | 'permission-required' | 'unavailable' | 'error'; count: number; message: string };

export function startGpsWatch(onUpdate: (state: GpsState) => void, onError?: (state: GpsState) => void): () => void {
  if (!('geolocation' in navigator)) { const state: GpsState = { status: 'unavailable', message: 'This browser does not expose geolocation.' }; onUpdate(state); return () => undefined; }
  const watchId = navigator.geolocation.watchPosition(position => onUpdate({ status: 'watching', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, headingDeg: position.coords.heading ?? undefined, speedKph: position.coords.speed === null ? undefined : position.coords.speed * 3.6 }), error => { const state: GpsState = { status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error', message: error.message }; onError?.(state); onUpdate(state); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
  return () => navigator.geolocation.clearWatch(watchId);
}

export async function inspectBrowserCamera(): Promise<CameraCapability> {
  if (!navigator.mediaDevices?.enumerateDevices) return { status: 'unavailable', count: 0, message: 'This browser does not expose camera enumeration.' };
  try { const devices = await navigator.mediaDevices.enumerateDevices(); const count = devices.filter(device => device.kind === 'videoinput').length; const labelled = devices.some(device => device.kind === 'videoinput' && device.label); return count ? { status: labelled ? 'available' : 'permission-required', count, message: labelled ? `${count} browser camera device(s) detected. This is not proof of a vehicle camera connection.` : `${count} camera input(s) reported; permission is required to identify them.` } : { status: 'unavailable', count: 0, message: 'No browser camera input was reported.' }; }
  catch { return { status: 'error', count: 0, message: 'Camera capability check failed.' }; }
}

export function openStreetMapUrl(latitude: number, longitude: number, zoom = 16): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isInteger(zoom) || zoom < 1 || zoom > 20) throw new RangeError('Invalid map coordinates');
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=${zoom}/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
}
