"""Génère un jeu de mesures capteurs reproductible pour le prototype IA."""

from pathlib import Path
import csv
import math
import random
from datetime import datetime, timedelta, timezone


OUTPUT = Path(__file__).parent / "data" / "sensor_data.csv"
ROW_COUNT = 1000
INTERVAL_SECONDS = 5
SEED = 42


def main() -> None:
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


if __name__ == "__main__":
    main()
