"""Create an honest, narrated RoadGuard submission demo from project facts.

This uses only local assets and Windows' installed SAPI voice via pyttsx3.
It does not claim live model inference or safety validation.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "demo" / "roadguard-demo.mp4"

SLIDES = [
    ("ROADGUARD", "Evidence-first hazard intelligence\nPotholes • animals • route-aware advisory alerts"),
    ("1 / DASHBOARD", "Synthetic Demo mode\nExplore the complete workflow without uploading footage or credentials."),
    ("2 / CONTEXT", "Route • direction • speed • vehicle type • lighting\nRelevant hazards stay ahead; wrong-route and behind-vehicle findings are excluded."),
    ("3 / HAZARD TYPES", "Potholes remain separate from animal-on-road observations\nand possible animal incidents. Animal findings mean review required."),
    ("4 / EVIDENCE FUSION", "Repeated frames do not create independent corroboration.\nIndependent sources, freshness, distance, confidence and replay protection matter."),
    ("5 / RESPONSE", "A response request does not close a hazard.\nFresh explicit clear-view observations from independent sources are required."),
    ("6 / SERVER WORKSPACE", "Role-scoped authentication • Node • SQLite • audit trail\nPersistent evidence, replay receipts and API event cursors."),
    ("7 / VALIDATION", "Deterministic tests cover engine, API, UI, simulation and boundaries.\nSynthetic success is not model accuracy."),
    ("8 / LIMITATIONS", "No trained pothole model, local labelled footage, physical camera calibration,\nor safety certification is claimed. roadSafetyValidated remains false."),
    ("ROADGUARD", "A reproducible, accountable pilot\nRepository and live synthetic demo linked in the submission."),
]
DURATIONS = [12, 15, 18, 17, 18, 17, 16, 15, 17, 5]

SCRIPT = """This is RoadGuard, an evidence-first hazard-intelligence pilot for potholes and animal-related road hazards. It combines camera observations, route context, vehicle state, and strict evidence rules to produce advisory alerts.

The dashboard starts in Synthetic Demo mode, so the workflow can be explored without uploading footage or credentials. The map and hazard cards show active evidence, severity, direction, confidence, and source history.

The operator can change route, direction, speed, vehicle type, and lighting. RoadGuard uses these inputs to decide whether a hazard is relevant ahead. A hazard behind the vehicle or on the wrong route is excluded.

Potholes remain separate from animal-on-road observations and possible animal incidents. An animal observation means review is required. It never becomes an injury, death, or collision claim.

Repeated frames from the same source do not create independent corroboration. A genuinely independent source can corroborate a hazard within configured time and distance boundaries. Duplicate, stale, malformed, or low-quality evidence is rejected or recorded.

When an authority requests a response, RoadGuard does not close the hazard immediately. Closure requires fresh, explicit clear-view observations from independent sources, newer than the original finding.

The Server Workspace demonstrates the authenticated path. Role-scoped credentials control readers, sources, and authorities. The Node and SQLite service persists evidence, audit records, replay protection, and API event cursors.

This is a tested software pilot, not a production road-safety system. The current detector is a transparent synthetic baseline; no trained pothole model, local labelled footage, physical camera calibration, or safety validation is claimed. RoadGuard keeps roadSafetyValidated false until those gates are completed.

The repository and live synthetic demo are included with the submission. This is RoadGuard: reproducible, accountable hazard intelligence for a safer pilot."""


def font(size: int):
    for candidate in (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def make_slides(directory: Path) -> None:
    title_font, body_font, small_font = font(54), font(34), font(22)
    index = 0
    for slide_no, ((heading, body), duration) in enumerate(zip(SLIDES, DURATIONS)):
        image = Image.new("RGB", (1280, 720), "#0b1424")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 18, 720), fill="#f59e0b")
        draw.ellipse((1050, -180, 1450, 220), fill="#113c5c")
        draw.ellipse((1100, 520, 1420, 840), fill="#142c45")
        draw.text((90, 110), heading, font=title_font, fill="#f8fafc")
        y = 240
        for line in body.splitlines():
            draw.text((95, y), line, font=body_font, fill="#a7d8e8")
            y += 55
        draw.text((95, 625), "ROADGUARD  •  SYNTHETIC PILOT  •  NOT ROAD-SAFETY VALIDATED", font=small_font, fill="#94a3b8")
        for _ in range(duration * 2):
            image.save(directory / f"frame-{index:04d}.png")
            index += 1


def create_audio(path: Path) -> None:
    import pyttsx3

    engine = pyttsx3.init()
    engine.setProperty("rate", 168)
    engine.setProperty("volume", 1.0)
    engine.save_to_file(SCRIPT, str(path))
    engine.runAndWait()


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise SystemExit(f"No ffmpeg encoder available: {exc}")
    with tempfile.TemporaryDirectory(prefix="roadguard-demo-") as temp:
        work = Path(temp)
        make_slides(work)
        audio = work / "voiceover.wav"
        create_audio(audio)
        command = [ffmpeg, "-y", "-framerate", "2", "-i", str(work / "frame-%04d.png"), "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(OUT)]
        subprocess.run(command, check=True, capture_output=True, text=True)
    print(OUT)


if __name__ == "__main__":
    main()
