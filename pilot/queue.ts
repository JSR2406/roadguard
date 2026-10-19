import type { Annotation, AnnotationManifest } from "./types.ts";

export interface ReviewQueueItem { annotationId: string; captureId: string; label: Annotation["label"]; priority: number; reason: string; }
const priority = (a: Annotation): number => (a.consentLicence.consentStatus !== "verified" || a.consentLicence.licenceStatus !== "verified" ? 3 : a.severity === "high" ? 2 : 1);
export function generateReviewQueue(manifest: AnnotationManifest): ReviewQueueItem[] {
  return manifest.annotations.filter((a) => a.status === "proposed" || a.status === "in-review").map((a) => ({ annotationId: a.annotationId, captureId: a.captureId, label: a.label, priority: priority(a), reason: a.consentLicence.consentStatus !== "verified" || a.consentLicence.licenceStatus !== "verified" ? "consent/licence evidence incomplete" : "annotation requires review" })).sort((a, b) => b.priority - a.priority || a.annotationId.localeCompare(b.annotationId));
}
