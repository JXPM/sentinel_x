"""Étape 1 locale : python ai/anomalies/prepare_data.py."""

import argparse
import json
from pathlib import Path

import pandas as pd

from features import FEATURE_COLUMNS, build_features, chronological_split, validate_data

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=ROOT / "data/sensor_data.csv")
    parser.add_argument("--cutoff", default="2026-10-05T10:50:00Z",
                        help="Fin de la période d'entraînement, à adapter à chaque acquisition")
    parser.add_argument("--output", type=Path, default=ROOT / "data/prepared")
    args = parser.parse_args()
    clean, report = validate_data(pd.read_csv(args.csv))
    features = build_features(clean)
    train, evaluation, gap = chronological_split(features, pd.Timestamp(args.cutoff))
    if train.empty or evaluation.empty:
        raise ValueError("Séparation vide : adapter --cutoff à la période enregistrée")
    # Protection propre au CSV étiqueté : la période IF doit être normale.
    if "expected_scenario" in train and not train.expected_scenario.eq("normal").all():
        raise ValueError("La période d'entraînement contient des scénarios non normaux")
    report.update({"feature_columns": FEATURE_COLUMNS, "feature_count": len(FEATURE_COLUMNS),
                   "feature_rows": len(features), "warmup_or_incomplete_rows": len(clean) - len(features),
                   "train_rows": len(train), "evaluation_rows": len(evaluation), "gap_rows": len(gap),
                   "cutoff": args.cutoff, "embargo_seconds": 300})
    args.output.mkdir(parents=True, exist_ok=True)
    for name, frame in (("clean", clean), ("train", train), ("evaluation", evaluation)):
        frame.to_csv(args.output / f"{name}.csv", index=False)
    (args.output / "quality_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Résultats : {args.output}")


if __name__ == "__main__":
    main()
