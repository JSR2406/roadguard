# RoadGuard pothole detector

## Intended use
Research and internal road-condition triage only. The sole normalized class is `pothole`; `D40` is mapped to it explicitly. No road-safety validation is claimed (`roadSafetyValidated: false`).

## Data and provenance
Record the upstream dataset, license, country/source, retrieval date, and checksum in the inspection report before conversion. Invalid, corrupt, missing, duplicate, and unrecognized annotations are reported and never fabricated.

## Limitations
Performance depends on geography, weather, camera, annotation quality, and class balance. This pipeline does not establish regulatory or operational safety approval.

## Reproducibility
Python 3.11; stdlib plus PIL/PyYAML (optional NumPy/sklearn). Training/inference/export require an installed and permitted Ultralytics or compatible framework and a real model; the commands fail closed otherwise.
