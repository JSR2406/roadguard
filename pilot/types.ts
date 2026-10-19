export type SourceKind = "usb-webcam" | "recorded-dashcam";
export type ReviewStatus = "proposed" | "in-review" | "accepted" | "rejected";
export type EvidenceStatus = "missing" | "pending" | "verified";
export type AnnotationLabel = "pothole" | "animal" | "lighting" | "weather" | "occlusion";
export type CalibrationStatus = "pending" | "pass" | "fail";

export interface CoordinateBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface PilotConfig {
  pilotId: string;
  region: "Pune/Pimpri-Chinchwad";
  timezone: "Asia/Kolkata";
  selectedCorridor: string;
  corridorNotes: string;
  coordinateBounds: CoordinateBounds;
  safetyValidated: false;
  roadSafetyValidated: false;
}

export interface CaptureRecord {
  captureId: string;
  source: SourceKind;
  localPath: string;
  mimeType: string;
  capturedAt: string;
  durationMs: number;
  sha256: string;
  location?: { latitude: number; longitude: number };
  metadata?: { frameRate?: number; width?: number; height?: number; gpsTrackPath?: string };
}

export interface CaptureManifest {
  manifestVersion: "1.0";
  pilotId: string;
  captures: CaptureRecord[];
}

export interface ConsentLicence {
  consentStatus: EvidenceStatus;
  licenceStatus: EvidenceStatus;
  consentReference?: string;
  licenceReference?: string;
  notes?: string;
}

export interface Annotation {
  annotationId: string;
  captureId: string;
  label: AnnotationLabel;
  frame: number;
  confidence: number;
  severity: "low" | "medium" | "high";
  box?: { x: number; y: number; width: number; height: number };
  reviewer?: string;
  status: ReviewStatus;
  consentLicence: ConsentLicence;
}

export interface AnnotationManifest {
  manifestVersion: "1.0";
  pilotId: string;
  annotations: Annotation[];
}

export interface CalibrationItem {
  component: "camera" | "gps" | "imu";
  status: CalibrationStatus;
  checkedAt?: string;
  evidencePath?: string;
  notes?: string;
}

export interface CalibrationChecklist {
  checklistVersion: "1.0";
  pilotId: string;
  hardwareState: "missing" | "present";
  items: CalibrationItem[];
  overallStatus: CalibrationStatus;
  roadSafetyValidated: false;
}
