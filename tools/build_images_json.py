#!/usr/bin/env python3
"""
Régénère data/images.json à partir du contenu du dossier images/.

Convention de nommage (le préfixe décide du type, le niveau est optionnel) :

    real-01.jpg               vraie photo, utilisable à tous les niveaux
    real-hard-02.jpg          vraie photo réservée au niveau « difficile »
    fake-easy-01.png          image IA grossière            -> niveau facile
    fake-medium-01.png        image IA crédible             -> niveau moyen
    fake-hard-01.png          image IA très réussie         -> niveau difficile
    fake-07.png               image IA sans niveau indiqué  -> niveau moyen

Usage :  python3 tools/build_images_json.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
OUT = ROOT / "data" / "images.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"}
LEVELS = ("easy", "medium", "hard")
NAME_RE = re.compile(r"^(real|fake)-(?:(easy|medium|hard)-)?(.+)$", re.IGNORECASE)


def natural_key(name: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def main():
    real, fake = [], []
    files = sorted(
        (p for p in IMAGES_DIR.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS),
        key=lambda p: natural_key(p.name),
    )
    for p in files:
        m = NAME_RE.match(p.stem)
        if not m:
            print(f"Ignoré (nom non reconnu) : {p.name}")
            continue
        kind, level = m.group(1).lower(), (m.group(2) or "").lower()
        entry = {"id": p.stem, "src": f"images/{p.name}"}
        if kind == "real":
            if level:
                entry["difficulty"] = level
            real.append(entry)
        else:
            entry["difficulty"] = level or "medium"
            fake.append(entry)

    data = {"version": 2, "real": real, "fake": fake}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{OUT.relative_to(ROOT)} : {len(real)} vraies photos, {len(fake)} images IA")
    for lv in LEVELS:
        r = [i for i in real if i.get("difficulty", lv) == lv]
        f = [i for i in fake if i["difficulty"] == lv]
        rounds = min(len(r), len(f) // 2)
        print(f"  {lv:<7} : {len(r)} vraies, {len(f)} IA -> {rounds} tour(s) possible(s)")


if __name__ == "__main__":
    main()
