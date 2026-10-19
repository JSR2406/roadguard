import type { PilotConfig } from "./types.ts";

/** Deliberately incomplete local pilot configuration. Replace the corridor placeholder after approval. */
export const PUNE_PILOT_CONFIG: PilotConfig = {
  pilotId: "roadguard-pune-pc-pilot",
  region: "Pune/Pimpri-Chinchwad",
  timezone: "Asia/Kolkata",
  selectedCorridor: "TODO: select and approve a Pune/Pimpri-Chinchwad corridor",
  corridorNotes: "Corridor, permissions, hardware, and licence are not yet selected.",
  coordinateBounds: { minLatitude: 18.20, maxLatitude: 18.75, minLongitude: 73.65, maxLongitude: 74.10 },
  safetyValidated: false,
  roadSafetyValidated: false,
};
