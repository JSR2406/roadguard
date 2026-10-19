import type { AnnotationManifest, CalibrationChecklist, CaptureManifest, PilotConfig } from "./types.ts";

export interface ValidationResult { valid: boolean; errors: string[]; }
const prohibited = ["directCameraClaim", "cameraHandle", "cameraDevice", "openCamera"];
const result = (errors: string[]): ValidationResult => ({ valid: errors.length === 0, errors });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const iso = (v: unknown): boolean => typeof v === "string" && !Number.isNaN(Date.parse(v));
const hasProhibited = (v: unknown, path = "root"): string[] => {
  if (!isObject(v)) return [];
  return Object.entries(v).flatMap(([key, value]) => prohibited.includes(key) ? [`${path}.${key}: direct camera claims are not allowed`] : hasProhibited(value, `${path}.${key}`));
};

export function validatePilotConfig(config: PilotConfig): ValidationResult {
  const b = config?.coordinateBounds;
  const errors = [...hasProhibited(config)];
  if (config?.timezone !== "Asia/Kolkata") errors.push("timezone must be Asia/Kolkata");
  if (config?.region !== "Pune/Pimpri-Chinchwad") errors.push("region must be Pune/Pimpri-Chinchwad");
  if (config?.roadSafetyValidated !== false) errors.push("roadSafetyValidated must remain false");
  if (config?.safetyValidated !== false) errors.push("safetyValidated must remain false");
  if (!b || b.minLatitude >= b.maxLatitude || b.minLongitude >= b.maxLongitude) errors.push("coordinate bounds must be ordered");
  return result(errors);
}

export function validateCaptureManifest(manifest: CaptureManifest, config = PUNE_BOUNDS): ValidationResult {
  const errors = hasProhibited(manifest);
  if (manifest?.manifestVersion !== "1.0") errors.push("manifestVersion must be 1.0");
  if (!Array.isArray(manifest?.captures)) errors.push("captures must be an array");
  const ids = new Set<string>();
  for (const [i, capture] of (manifest?.captures ?? []).entries()) {
    const p = `captures[${i}]`;
    if (!capture?.captureId || ids.has(capture.captureId)) errors.push(`${p}.captureId must be unique`); else ids.add(capture.captureId);
    if (capture?.source !== "usb-webcam" && capture?.source !== "recorded-dashcam") errors.push(`${p}.source is invalid`);
    if (typeof capture?.localPath !== "string" || !capture.localPath.trim()) errors.push(`${p}.localPath is required`);
    if (!iso(capture?.capturedAt)) errors.push(`${p}.capturedAt must be an ISO date`);
    if (!Number.isInteger(capture?.durationMs) || capture.durationMs < 0) errors.push(`${p}.durationMs must be a non-negative integer`);
    if (!/^[a-f0-9]{64}$/i.test(capture?.sha256 ?? "")) errors.push(`${p}.sha256 must be a 64-character hex digest`);
    if (capture?.location && !inBounds(capture.location.latitude, capture.location.longitude, config)) errors.push(`${p}.location is outside Pune bounds`);
  }
  return result(errors);
}

const PUNE_BOUNDS = { minLatitude: 18.20, maxLatitude: 18.75, minLongitude: 73.65, maxLongitude: 74.10 };
function inBounds(lat: number, lon: number, b: typeof PUNE_BOUNDS): boolean { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= b.minLatitude && lat <= b.maxLatitude && lon >= b.minLongitude && lon <= b.maxLongitude; }

export function validateAnnotationManifest(manifest: AnnotationManifest): ValidationResult {
  const errors = hasProhibited(manifest); const ids = new Set<string>();
  if (manifest?.manifestVersion !== "1.0") errors.push("manifestVersion must be 1.0");
  if (!Array.isArray(manifest?.annotations)) errors.push("annotations must be an array");
  for (const [i, a] of (manifest?.annotations ?? []).entries()) {
    const p = `annotations[${i}]`;
    if (!a?.annotationId || ids.has(a.annotationId)) errors.push(`${p}.annotationId must be unique`); else ids.add(a.annotationId);
    if (!a?.captureId) errors.push(`${p}.captureId is required`);
    if (!["pothole", "animal", "lighting", "weather", "occlusion"].includes(a?.label)) errors.push(`${p}.label is invalid`);
    if (!Number.isInteger(a?.frame) || a.frame < 0) errors.push(`${p}.frame must be a non-negative integer`);
    if (typeof a?.confidence !== "number" || a.confidence < 0 || a.confidence > 1) errors.push(`${p}.confidence must be 0..1`);
    if (!a?.consentLicence || !["missing", "pending", "verified"].includes(a.consentLicence.consentStatus) || !["missing", "pending", "verified"].includes(a.consentLicence.licenceStatus)) errors.push(`${p}.consentLicence statuses are required`);
  }
  return result(errors);
}

export function validateCalibration(checklist: CalibrationChecklist): ValidationResult {
  const errors = hasProhibited(checklist);
  if (checklist?.roadSafetyValidated !== false) errors.push("roadSafetyValidated must remain false");
  if (!["missing", "present"].includes(checklist?.hardwareState)) errors.push("hardwareState must be missing or present");
  for (const component of ["camera", "gps", "imu"] as const) if (!checklist?.items?.some((i) => i.component === component)) errors.push(`missing calibration item: ${component}`);
  return result(errors);
}
