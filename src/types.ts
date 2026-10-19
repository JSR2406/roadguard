export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type HazardType = 'pothole' | 'animal_on_road' | 'animal_incident';
export type Lighting = 'day' | 'night' | 'unknown';
export type HazardStatus = 'candidate' | 'verified' | 'repair_pending' | 'repaired';
export interface Observation {
  hazardType?: HazardType; lighting?: Lighting;
  id: string; sourceId: string; sourceType: 'dashcam' | 'cctv';
  segmentId: string; direction: 1 | -1; offsetM: number;
  confidence: number; severity: Severity; observedAt: number;
  clearView: boolean; finding: 'pothole' | 'clear';
}
export interface Hazard {
  hazardType?: HazardType; lighting?: Lighting;
  id: string; segmentId: string; direction: 1 | -1; offsetM: number;
  severity: Severity; status: HazardStatus; observations: Observation[];
  firstSeen: number; lastSeen: number; repairRequestedAt?: number;
}
export interface RouteLeg { segmentId: string; direction: 1 | -1; lengthM: number }
export interface Vehicle {
  lighting?: Lighting;
  id: string; speedKph: number; kind: 'car' | 'two-wheeler';
  route: RouteLeg[]; legIndex: number; offsetM: number;
}
export interface HazardAlert {
  hazardId: string; distanceM: number; warningDistanceM: number;
  severity: Severity; message: string; provisional: boolean;
}
