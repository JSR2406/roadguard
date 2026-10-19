import { ingestObservation } from '../src/engine';
import type { CameraReplayResult, CameraReplayScenario, DirectedHazard } from './types';

/** Replays camera frames in stable timestamp/id order. Engine idempotency handles duplicates and stale frames. */
export function replayCameraEvidence(scenario: CameraReplayScenario): CameraReplayResult {
  let hazards = (scenario.initialHazards ?? []).map(h => ({ ...h, observations: [...h.observations] }));
  const duplicateReports: string[] = [], conflicts: string[] = [], transitions: CameraReplayResult['transitions'] = [];
  const seen = new Set<string>();
  for (const observation of [...scenario.observations].sort((a, b) => a.observedAt - b.observedAt || a.id.localeCompare(b.id))) {
    if (seen.has(observation.id) || hazards.some(h => h.observations.some(o => o.id === observation.id))) { duplicateReports.push(observation.id); continue; }
    const before = hazards.find(h => h.segmentId === observation.segmentId && h.direction === observation.direction && Math.abs(h.offsetM - observation.offsetM) <= 15);
    const beforeStatus = before?.status;
    hazards = ingestObservation(hazards, observation, scenario.now);
    seen.add(observation.id);
    const after = hazards.find(h => h.segmentId === observation.segmentId && h.direction === observation.direction && Math.abs(h.offsetM - observation.offsetM) <= 15);
    if (before && after && beforeStatus !== after.status) transitions.push({ hazardId: after.id, from: beforeStatus!, to: after.status });
    if (before && !after && observation.finding === 'pothole') conflicts.push(observation.id);
  }
  for (const id of scenario.repairRequests ?? []) {
    const hazard = hazards.find(h => h.id === id);
    if (hazard && hazard.status !== 'repaired' && hazard.status !== 'repair_pending') conflicts.push(`repair:${id}`);
  }
  return { hazards: hazards as DirectedHazard[], duplicateReports, conflicts, transitions, safetyValidated: false };
}
