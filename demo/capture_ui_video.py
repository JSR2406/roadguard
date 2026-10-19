"""Capture real RoadGuard screens from the deployed synthetic demo.

The resulting PNGs are used by create_demo_video.py. This is a browser-captured
product demo, not fabricated model output.
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


URL = "https://jsr2406.github.io/roadguard/"
OUT = Path(__file__).resolve().parent / "ui-captures"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        page.goto(URL, wait_until="networkidle")
        page.screenshot(path=str(OUT / "01-dashboard.png"))
        for number, y in enumerate((560, 1160, 1740, 2280, 2920, 3500), start=2):
            page.evaluate("y => window.scrollTo(0, y)", y)
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / f"{number:02d}-scroll-{y}.png"))
        page.locator("button", has_text="Driver simulator").click()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "08-driver-simulator.png"))
        page.locator("button", has_text="Validation notes").click()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "09-validation-notes.png"))
        browser.close()
    print(OUT)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        raise SystemExit(f"UI capture failed: {exc}")
