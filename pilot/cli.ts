import { readFile } from "node:fs/promises";
import { generateReviewQueue } from "./queue.ts";
import { validateAnnotationManifest, validateCaptureManifest } from "./validate.ts";

const [, , command, file] = process.argv;
if (!command || !file || !["validate-captures", "validate-annotations", "queue"].includes(command)) {
  console.error("Usage: npx tsx pilot/cli.ts <validate-captures|validate-annotations|queue> <manifest.json>"); process.exitCode = 2;
} else {
  const data = JSON.parse(await readFile(file, "utf8"));
  if (command === "validate-captures") console.log(JSON.stringify(validateCaptureManifest(data), null, 2));
  if (command === "validate-annotations") console.log(JSON.stringify(validateAnnotationManifest(data), null, 2));
  if (command === "queue") console.log(JSON.stringify(generateReviewQueue(data), null, 2));
}
