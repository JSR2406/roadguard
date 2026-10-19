# Pune / Pimpri-Chinchwad pilot: data and map decision record

Research date: 19 October 2026. No dataset, image, tile, model weight or external footage was downloaded or copied into this repository. A licence being visible for a repository does not automatically license its images, annotations, weights or commercial use.

## Pilot boundary

- Region: Pune and Pimpri-Chinchwad, Maharashtra, India.
- Time zone: `Asia/Kolkata`.
- Corridor: **not selected or approved yet**. `pilot/config.ts` deliberately contains a TODO placeholder.
- Safety flags: `safetyValidated: false` and `roadSafetyValidated: false`.
- Initial capture hardware: USB webcam or permitted recorded dashcam files. No internal vehicle camera is assumed.
- Local data path: private capture directory outside git; manifests store hashes and references, not raw video in source control.

## Licence review record

The detailed machine-readable review is `pilot/licence-review.json`. It records source URLs, terms URLs, observed licence evidence, commercial-training and redistribution status, attribution requirements, open questions and a conservative status. `commercialReleaseApproved` is `false`. No external asset was downloaded.

## Public dataset candidates

| Candidate | Licence evidence reviewed | Fit | Release decision |
|---|---|---|---|
| [RDD2022 / CRDDC](https://crddc2022.sekilab.global/) and [Figshare record](https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547) | Official project page identifies India data and D00/D10/D20/D40, including D40 potholes. The page reviewed does not clearly establish a commercial licence for every archive. | Best India-specific pothole starting point. | **Licence confirmation required before commercial use.** Download only after recording exact archive terms and checksum. |
| [RDD2020 / Mendeley](https://data.mendeley.com/datasets/5ty2wb6gvg/1) and [GRDDC](https://rdd2020.sekilab.global/) | The reviewed project material states images are CC BY-SA 4.0; code is separately MIT. | India road-damage benchmark and transfer-learning baseline. | Candidate after confirming whether annotations, weights and intended commercial use inherit separate terms. |
| [RoadDamageDetector](https://github.com/sekilab/RoadDamageDetector) | Code repository marked MIT; images described as CC BY-SA 4.0. | Code/reference labels and benchmark lineage. | Do not treat MIT as licensing images or model weights. |
| [BDD100K](https://github.com/bdd100k/bdd100k) | Reviewed repository code is BSD-3-Clause; underlying dataset terms must be checked separately. | Driving-scene domain pretraining; day/night/weather variation. | Not a pothole dataset and not evidence of Indian/commercial rights. Confirm dataset terms before use. |
| [Open Images V7](https://storage.googleapis.com/openimages/web/index.html) | Dataset page states CC BY 4.0 with attribution and possible third-party rights. | Broad animal classes and hard-negative pretraining. | Not road-specific or India-specific; retain per-image attribution and rights review. |
| [WILDS / iWildCam](https://wilds.stanford.edu/datasets/) | Dataset-specific documentation; no blanket commercial licence established in this review. | Wildlife domain shift research. | Not dashcam/road-animal data; do not assume commercial use. |

**Gap:** no clearly verified public dataset was found that covers Pune road animals, nighttime headlights, monsoon rain, glare, obstruction and possible animal incidents under a single commercial-ready licence. The pilot must collect an independently labelled local set after approval.

## Local capture and labelling plan

1. Select one corridor with Pune/PCMC authority approval; record road name, start/end coordinates, direction, carriageway and operating hours.
2. Obtain written permission for every camera/vehicle and participant; avoid faces, plates and identifiable route histories or redact them at the edge.
3. Capture separate strata: daylight, night, dry, rain/monsoon, glare/headlights, occlusion, road works, clean road, animals present, possible incident requiring human review and repaired road.
4. Use `pilot/types.ts` manifests. Every file receives a SHA-256, capture time, source kind, optional GPS track reference and consent/licence evidence status.
5. Label potholes, animals, lighting, weather and occlusion. Do not label injury/death from a frame; use `animal_incident` only as a human-review event with supporting temporal evidence.
6. Split train/validation/test by journey, road segment, camera and date. Adjacent frames from one drive must not cross splits.
7. Keep the public datasets, local data, annotations and model checkpoints in separate licence records. A failed licence check means the item cannot enter training or distribution.

Run the local validators before training:

```powershell
npx tsx pilot/cli.ts validate-captures path/to/captures.json
npx tsx pilot/cli.ts validate-annotations path/to/annotations.json
npx tsx pilot/cli.ts queue path/to/annotations.json
npx tsx --test tests/pilot.test.ts
```

## Map/provider comparison

The provider catalogue is implemented in `map/providers.ts` and fail-closes until a provider is explicitly licence-verified. Current profiles are:

| Provider | Pune pilot position | Main review item |
|---|---|---|
| OSM + MapLibre + self-hosted OSRM/GraphHopper | Recommended first comparison | OSM ODbL attribution/share-alike analysis; self-host tiles/routing; public tile policy; local road QA |
| Mapbox | Commercial fallback | Vehicle-application terms, API usage pricing, attribution and hosted dependency |
| HERE | Commercial comparison | India/Pune coverage, traffic, map matching, caching and contract |
| Google Maps Platform | Separate evaluation only | Terms restrict mixing with non-Google maps and using Google content for ML training; vehicle restrictions and billing |
| TomTom | Commercial comparison | Pune coverage, traffic freshness, quotas, caching and derived-data rights |

### Recommended staged choice

Begin with OSM-derived data plus MapLibre and self-hosted routing for a controlled pilot, after legal review and attribution setup. Benchmark OSRM versus GraphHopper on the same Pune route corpus. Compare a paid HERE or TomTom evaluation only if traffic-aware routing/support is required. Do not use public OSM tiles, Overpass, or the OSRM demo as a production SLA. Do not use Google map content as training data or mix it with an OSM base without legal review.

The map layer still needs a real licensed provider, a versioned directed road graph, route matching, carriageway/lane identity and uncertainty output. The prototype's fixed segments and OpenStreetMap coordinate link are not a live map integration.

## Missing inputs and release gates

- Written dataset/model licences and attribution plan.
- Approved Pune/PCMC corridor and authority contacts.
- USB webcam/dashcam hardware and permitted capture locations.
- Production map-provider account/contract or approved self-hosted OSM stack.
- Calibrated camera/GPS/IMU and surveyed ground truth.
- HTTPS host and working Docker engine.
- Closed-track safety protocol and approvals.

No missing item is inferred as approved. Until all gates are evidenced, `roadSafetyValidated` remains false.
