"""Génère un jeu de mesures capteurs reproductible pour le prototype IA."""

from pathlib import Path
import argparse
import csv
import hashlib
import json
import math
import random
from datetime import datetime, timedelta, timezone


OUTPUT = Path(__file__).parent / "data" / "sensor_data.csv"
ROW_COUNT = 1000
INTERVAL_SECONDS = 5
SEED = 42


def generate_legacy() -> None:
    rng = random.Random(SEED)
    start = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)
    rows = []

    for index in range(ROW_COUNT):
        timestamp = start + timedelta(seconds=index * INTERVAL_SECONDS)
        slow_cycle = math.sin(index / 90)

        temperature = 24.0 + 0.25 * slow_cycle + rng.gauss(0, 0.12)
        humidity = 55.0 - 0.5 * slow_cycle + rng.gauss(0, 0.45)
        gas = 120.0 + 2.0 * slow_cycle + rng.gauss(0, 2.2)
        presence = rng.random() < 0.025
        scenario = "normal"

        # Dérive progressive température + gaz : incident prédictif.
        if 750 <= index <= 810:
            progress = (index - 750) / 60
            temperature += 7.0 * progress
            gas += 170.0 * progress
            humidity -= 5.0 * progress
            scenario = "drift_temp_gas"

        # Pic bref de gaz, utile pour vérifier la sensibilité du modèle.
        if 900 <= index <= 910:
            gas += 115.0
            scenario = "gas_spike"

        rows.append(
            {
                "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                "device_id": "esp8266-01",
                "temperature": f"{temperature:.2f}",
                "humidity": f"{humidity:.2f}",
                "gas": f"{gas:.2f}",
                "presence": str(presence).lower(),
                # Réservé à l'évaluation ; ne pas l'utiliser pour entraîner le modèle.
                "expected_scenario": scenario,
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"CSV créé : {OUTPUT}")
    print(f"Lignes : {len(rows)} (0-699 conseillées pour l'entraînement normal)")


def generate_session(seed: int, start: datetime, session_id: str, incidents: bool,
                     row_count: int = 1800) -> tuple[list[dict], list[dict]]:
    """Session synthétique : bruit, cycles normaux et incidents à retour progressif."""
    rng = random.Random(seed)
    phase = rng.uniform(0, 2 * math.pi)
    base_t, base_h, base_g = rng.uniform(23.7, 24.3), rng.uniform(54, 56), rng.uniform(116, 124)
    noise = rng.uniform(.8, 1.2)
    events = []
    if incidents:
        # Plusieurs types, avec des amplitudes et instants distincts par session.
        for position, label in zip((250, 600, 950, 1300),
                                   ("overheat", "gas_leak", "combined", "gas_spike")):
            begin = position + rng.randint(-25, 25)
            rise = rng.randint(45, 70) if label != "gas_spike" else rng.randint(2, 4)
            hold = rng.randint(5, 12)
            fall = rng.randint(30, 50) if label != "gas_spike" else rng.randint(3, 6)
            events.append({"scenario": label, "begin_index": begin, "rise_rows": rise,
                           "hold_rows": hold, "fall_rows": fall,
                           "end_index": begin + rise + hold + fall - 1,
                           "temperature_amplitude": rng.uniform(4, 8),
                           "gas_amplitude": rng.uniform(90, 180),
                           "humidity_amplitude": rng.uniform(3, 6)})
    rows = []
    for index in range(row_count):
        # Cycles sur plusieurs périodes : couvrir une variété de régimes normaux.
        cycle = math.sin(index / 90 + phase)
        slow = math.sin(index / 250 + phase / 2)
        temperature = base_t + .3 * cycle + .15 * slow + rng.gauss(0, .12 * noise)
        humidity = base_h - .6 * cycle + .2 * slow + rng.gauss(0, .45 * noise)
        gas = base_g + 3 * cycle + 1.5 * slow + rng.gauss(0, 2.2 * noise)
        scenario = "normal"
        for event in events:
            if event["begin_index"] <= index <= event["end_index"]:
                elapsed = index - event["begin_index"]
                rise, hold, fall = event["rise_rows"], event["hold_rows"], event["fall_rows"]
                if elapsed < rise:
                    strength = (elapsed + 1) / rise
                elif elapsed < rise + hold:
                    strength = 1
                else:
                    strength = (fall - (elapsed - rise - hold)) / (fall + 1)
                scenario = event["scenario"]
                if scenario in ("overheat", "combined"):
                    temperature += strength * event["temperature_amplitude"]
                    humidity -= strength * event["humidity_amplitude"]
                if scenario in ("gas_leak", "combined", "gas_spike"):
                    gas += strength * event["gas_amplitude"]
        timestamp = start + timedelta(seconds=index * INTERVAL_SECONDS)
        rows.append({"timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                     "device_id": "esp8266-01", "session_id": session_id,
                     "temperature": f"{temperature:.2f}", "humidity": f"{humidity:.2f}",
                     "gas": f"{gas:.2f}", "presence": str(rng.random() < .025).lower(),
                     "expected_scenario": scenario, "data_origin": "synthetic"})
    for event in events:
        event["start"] = rows[event["begin_index"]]["timestamp"]
        event["end"] = rows[event["end_index"]]["timestamp"]
    return rows, events


def generate_sessions(output: Path, seed: int = 20261008) -> dict:
    """Répartition prédéfinie, avant tout réglage ou résultat du modèle."""
    original = OUTPUT.resolve()
    if output.resolve() == original or original.is_relative_to(output.resolve()):
        raise ValueError("Choisir un sous-dossier distinct du CSV historique")
    # Répertoire neuf pour éviter d'écraser une acquisition ou laisser des sessions obsolètes.
    if output.exists():
        raise FileExistsError(f"Le dossier existe déjà : {output}. Utiliser --output avec un nouveau nom.")
    manifest = {"data_origin": "synthetic", "base_seed": seed, "interval_seconds": 5,
                "rows_per_session": 1800, "sessions": [],
                "limitations": ["Même famille de simulation pour tous les ensembles",
                                "Sessions distinctes mais pas validation sur matériel réel",
                                "Ne pas examiner le test pour régler le modèle"]}
    start = datetime(2026, 10, 8, 8, tzinfo=timezone.utc)
    output.mkdir(parents=True)
    ordinal = 0
    for split, count in (("train", 6), ("validation", 3), ("test", 3)):
        (output / split).mkdir()
        for number in range(count):
            session_id = f"{split}-{number + 1:02d}"
            session_seed = seed + ordinal * 1009
            rows, events = generate_session(session_seed, start + timedelta(days=ordinal),
                                            session_id, incidents=split != "train")
            path = output / split / f"{session_id}.csv"
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            counts = {}
            for row in rows:
                label = row["expected_scenario"]
                counts[label] = counts.get(label, 0) + 1
            manifest["sessions"].append({"session_id": session_id, "split": split,
                                         "seed": session_seed, "path": path.relative_to(output).as_posix(),
                                         "rows": len(rows), "start": rows[0]["timestamp"],
                                         "end": rows[-1]["timestamp"], "scenario_counts": counts,
                                         "events": events, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            ordinal += 1
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT.parent / "sessions_v1")
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--legacy", action="store_true", help="Régénérer explicitement le CSV historique")
    args = parser.parse_args()
    if args.legacy:
        generate_legacy()
        return
    manifest = generate_sessions(args.output, args.seed)
    print(f"Sessions synthétiques créées : {args.output}")
    for split in ("train", "validation", "test"):
        sessions = [s for s in manifest["sessions"] if s["split"] == split]
        print(f"{split} : {len(sessions)} sessions, {sum(s['rows'] for s in sessions)} mesures")
    print("CSV historique conservé. Aucun modèle entraîné ; test réservé à l'évaluation finale.")


if __name__ == "__main__":
    main()
