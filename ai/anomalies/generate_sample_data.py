"""Génère un CSV normal synthétique au format telemetry, gaz en ppm."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent


def generate_data(rows=10800, seed=42, temperature=24., humidity=55., gas_ppm=120.,
                  gas_noise_ppm=2.2, device="synthetic-01"):
    if rows < 200 or not 0 <= humidity <= 100 or gas_ppm < 0 or gas_noise_ppm <= 0:
        raise ValueError("Au moins 200 mesures, humidité 0–100, gaz >= 0 et bruit gaz > 0 requis")
    if not np.isfinite([temperature, humidity, gas_ppm, gas_noise_ppm]).all():
        raise ValueError("Paramètres non finis")
    rng = np.random.default_rng(seed)
    t = np.arange(rows) * 2
    cycle = np.sin(2 * np.pi * t / 1800)
    slow = np.sin(2 * np.pi * t / 7200)
    # Valeurs d'exemple à calibrer, pas plages certifiées du capteur/gaz.
    gas = gas_ppm + gas_noise_ppm * (1.5 * cycle + .75 * slow + rng.normal(size=rows))
    return pd.DataFrame({
        "ts": pd.date_range("2026-10-08T08:00:00Z", periods=rows, freq="2s"),
        "dev": device,
        "temperature": temperature + .3 * cycle + .15 * slow + rng.normal(0, .12, rows),
        "humidity": np.clip(humidity - .6 * cycle + .2 * slow + rng.normal(0, .45, rows), 0, 100),
        "gas": np.maximum(0, np.rint(gas)).astype(int),
        "data_origin": "synthetic", "gas_unit": "ppm", "expected_scenario": "normal"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/synthetic_normal_ppm.csv")
    parser.add_argument("--rows", type=int, default=10800, help="10800 mesures = 6 h à cadence 2 s")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--temperature", type=float, default=24.)
    parser.add_argument("--humidity", type=float, default=55.)
    parser.add_argument("--gas-ppm", type=float, default=120., help="Niveau normal d'exemple à adapter")
    parser.add_argument("--gas-noise-ppm", type=float, default=2.2)
    args = parser.parse_args()
    data = generate_data(args.rows, args.seed, args.temperature, args.humidity, args.gas_ppm, args.gas_noise_ppm)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(args.output, index=False)
    (args.output.with_suffix(".json")).write_text(json.dumps({
        "origin": "synthetic", "gas_unit": "ppm", "interval_seconds": 2,
        "parameters": {k: v for k, v in vars(args).items() if k != "output"},
        "note": "Niveaux et bruit illustratifs : à calibrer avec les mesures réelles."},
        indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"CSV synthétique normal : {args.output} ({len(data)} mesures, gaz en ppm)")


if __name__ == "__main__":
    main()
