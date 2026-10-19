import { getAlerts } from '../src/engine';
import type { HazardReport, SimulationResult, SimulationScenario, VehicleWarnings } from './types';

const copyHazards = (hazards: SimulationScenario['hazards']) => hazards.map(h => ({ ...h, observations: h.observations.map(o => ({ ...o })) }));

/** Deterministic replay: reports arrive in stable timestamp/id order, then vehicles read their cache. */
export function simulateWarnings(scenario: SimulationScenario): SimulationResult {
  const latency = scenario.messageLatencyMs ?? 0;
  const hazards = copyHazards(scenario.hazards);
  const reports = [...(scenario.reports ?? [])].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const deliveredReports: HazardReport[] = [];
  for (const report of reports) {
    const vehicle = scenario.vehicles.find(v => v.id === report.vehicleId);
    const delay = report.messageLatencyMs ?? latency;
    const delivered = !!vehicle && vehicle.connection === 'online' && report.createdAt + delay <= scenario.now;
    if (delivered) deliveredReports.push({ ...report, messageLatencyMs: delay, delivered });
  }
  const warnings: VehicleWarnings[] = scenario.vehicles.map(vehicle => {
    // Offline vehicles use their local hazard cache; online vehicles use the live set.
    const visible = true;
    // An inaccurate position must not produce a false safety warning.
    const relevant = hazards.filter(h => !h.carriagewayId || !vehicle.carriagewayId || h.carriagewayId === vehicle.carriagewayId);
    const alerts = visible && vehicle.gpsErrorM <= 25 ? getAlerts(relevant, vehicle, scenario.now) : [];
    return { vehicleId: vehicle.id, atMs: scenario.now + latency, alerts, cached: vehicle.connection === 'offline' };
  });
  return { warnings, deliveredReports, hazards };
}

export const warningScenario = (hazards: SimulationScenario['hazards'], vehicles: SimulationScenario['vehicles'], now = 0) =>
  simulateWarnings({ now, hazards, vehicles });
