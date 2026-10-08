"""Entraîner Isolation Forest sur le CSV normal synthétique, gaz en ppm."""

import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from api_client import normalize_telemetry
from features import FEATURE_COLUMNS, WINDOW_SECONDS, build_features

ROOT = Path(__file__).resolve().parent


def utc_date(value):
    date = pd.Timestamp(value)
    if pd.isna(date) or date.tzinfo is None:
        raise ValueError("Utiliser une date avec fuseau, par exemple 2026-10-08T08:00:00Z")
    return date.tz_convert("UTC")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=ROOT / "data/synthetic_normal_ppm.csv")
    parser.add_argument("--contamination", type=float, default=.01)
    parser.add_argument("--max-gap-seconds", type=float, default=15)
    parser.add_argument("--model-path", type=Path, default=ROOT / "models/iforest_synthetic_ppm_60s.joblib")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports/synthetic_training")
    args = parser.parse_args()
    if not 0 < args.contamination <= .5:
        parser.error("Contamination hors de ]0,0.5]")
    raw = pd.read_csv(args.csv)
    if "gas_unit" not in raw or not raw.gas_unit.eq("ppm").all():
        raise ValueError("Le CSV doit indiquer gas_unit=ppm")
    if "data_origin" not in raw or not raw.data_origin.eq("synthetic").all():
        raise ValueError("Ce parcours attend data_origin=synthetic")
    data = normalize_telemetry(raw.to_dict("records"))
    start, end = data.timestamp.min(), data.timestamp.max()
    if "expected_scenario" in data and not data.expected_scenario.eq("normal").all():
        raise ValueError("La période contient des étiquettes non normales")
    features = build_features(data, args.max_gap_seconds)
    if len(features) < 100:
        raise ValueError("Moins de 100 fenêtres exploitables : collecter une période normale plus longue")
    model = make_pipeline(StandardScaler(), IsolationForest(
        n_estimators=200, contamination=args.contamination, random_state=42, n_jobs=-1))
    model.fit(features[FEATURE_COLUMNS])
    bundle = {"model": model, "feature_columns": FEATURE_COLUMNS, "windows_seconds": (WINDOW_SECONDS,),
              "max_gap_seconds": args.max_gap_seconds, "sklearn_version": sklearn.__version__,
              "training_period": {"from": start.isoformat(), "to": end.isoformat()},
              "devices": features.device_id.unique().tolist(), "gas_unit": "ppm", "training_origin": "synthetic",
              "status": "trained_not_independently_evaluated"}
    args.model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.model_path)
    restored = joblib.load(args.model_path)
    np.testing.assert_array_equal(restored["model"].predict(features[FEATURE_COLUMNS]), model.predict(features[FEATURE_COLUMNS]))
    np.testing.assert_allclose(restored["model"].decision_function(features[FEATURE_COLUMNS]),
                               model.decision_function(features[FEATURE_COLUMNS]), rtol=0, atol=0)
    report = {"received_rows": len(data), "training_rows": len(features), "feature_count": len(FEATURE_COLUMNS),
              "history_incomplete_rows": len(data) - len(features), "windows_seconds": [60],
              "training_period": bundle["training_period"], "devices": bundle["devices"],
              "parameters": {"n_estimators": 200, "contamination": args.contamination, "random_state": 42},
              "data_sha256": hashlib.sha256(data.to_csv(index=False).encode()).hexdigest(),
              "reload_verified": True, "independent_evaluation": False,
              "gas_unit": "ppm", "training_origin": "synthetic",
              "note": "Entraînement synthétique uniquement : performance sur les capteurs réels non validée."}
    args.report_dir.mkdir(parents=True, exist_ok=True)
    (args.report_dir / "training_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Modèle : {args.model_path}")


if __name__ == "__main__":
    main()
