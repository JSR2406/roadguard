import type { Hazard, HazardAlert, Observation, Vehicle } from '../src/types';

export type ConnectionState = 'online' | 'offline';
export type ReportKind = 'hazard' | 'repair';

export interface DirectedHazard extends Hazard {
  /** Optional carriageway identifier; matching vehicles must share it. */
  carriagewayId?: string;
}

export interface SimVehicle extends Vehicle {
  connection: ConnectionState;
  gpsErrorM: number;
  carriagewayId?: string;
}

export interface HazardReport {
  id: string;
  vehicleId: string;
  kind: ReportKind;
  hazardId?: string;
  hazard?: DirectedHazard;
  createdAt: number;
  messageLatencyMs: number;
  delivered: boolean;
}

export interface SimulationScenario {
  now: number;
  hazards: DirectedHazard[];
  vehicles: SimVehicle[];
  messageLatencyMs?: number;
  reports?: HazardReport[];
}

export interface VehicleWarnings {
  vehicleId: string;
  atMs: number;
  alerts: HazardAlert[];
  cached: boolean;
}

export interface SimulationResult {
  warnings: VehicleWarnings[];
  deliveredReports: HazardReport[];
  hazards: DirectedHazard[];
}

export interface CameraReplayResult {
  hazards: DirectedHazard[];
  duplicateReports: string[];
  conflicts: string[];
  transitions: Array<{ hazardId: string; from: string; to: string }>;
  safetyValidated: false;
}

export interface CameraReplayScenario {
  now: number;
  initialHazards?: DirectedHazard[];
  observations: Observation[];
  repairRequests?: string[];
}
