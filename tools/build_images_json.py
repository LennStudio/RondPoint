#!/usr/bin/env python3
"""
Régénère data/images.json à partir du contenu du dossier images/.

Convention de nommage (le préfixe décide du type) :
    images/real-01.jpg, images/real-02.webp ...   -> vraies photos de ronds-points
    images/fake-01.png, images/fake-02.jpg ...    -> images générées par IA

Usage :  python3 tools/build_images_json.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
OUT = ROOT / "data" / "images.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"}


def natural_key(name: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def collect(prefix: str):
    files = sorted(
        (p for p in IMAGES_DIR.iterdir()
         if p.is_file() and p.suffix.lower() in EXTENSIONS and p.stem.startswith(prefix + "-")),
        key=lambda p: natural_key(p.name),
    )
    return [{"id": p.stem, "src": f"images/{p.name}"} for p in files]


def main():
    data = {"version": 1, "real": collect("real"), "fake": collect("fake")}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {len(data['real'])} vraies photos, {len(data['fake'])} images IA")
    if len(data["real"]) == 0 or len(data["fake"]) < 2:
        print("Attention : il faut au moins 1 vraie photo et 2 images IA pour jouer.")


if __name__ == "__main__":
    main()
