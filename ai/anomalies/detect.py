"""Applique le modèle sauvegardé aux mesures réelles reçues via l'API."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import joblib
import pandas as pd

from api_client import fetch_telemetry
from features import FEATURE_COLUMNS, build_features
from train import utc_date

ROOT = Path(__file__).resolve().parent


def predict(data, bundle):
    if bundle.get("gas_unit") != "ppm" or tuple(bundle.get("windows_seconds", ())) != (60,):
        raise ValueError("Modèle incompatible : utiliser le nouveau modèle ppm sur 60 s")
    if bundle.get("feature_columns") != FEATURE_COLUMNS:
        raise ValueError("Ordre des variables incompatible")
    if data.empty:
        return pd.DataFrame(columns=["ts", "dev", "iforest", "anomaly", "class", "proba"])
    features = build_features(data, bundle["max_gap_seconds"])
    if features.empty:
        return pd.DataFrame(columns=["ts", "dev", "iforest", "anomaly", "class", "proba"])
    inputs = features[bundle["feature_columns"]]
    return pd.DataFrame({"ts": features.timestamp, "dev": features.device_id,
                         "iforest": bundle["model"].decision_function(inputs),
                         "anomaly": bundle["model"].predict(inputs) == -1,
                         "class": None, "proba": None})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("SENTINEL_API_URL"))
    parser.add_argument("--endpoint", default="/api/v1/telemetry")
    parser.add_argument("--dev")
    parser.add_argument("--from", dest="start")
    parser.add_argument("--to", dest="end")
    parser.add_argument("--watch", action="store_true", help="Interroger continuellement les dernières mesures")
    parser.add_argument("--poll-seconds", type=float, default=2)
    parser.add_argument("--lookback-seconds", type=int, default=180)
    parser.add_argument("--model", type=Path, default=ROOT / "models/iforest_synthetic_ppm_60s.joblib")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/real_predictions.csv")
    args = parser.parse_args()
    if not args.api_url:
        parser.error("Renseigner --api-url ou SENTINEL_API_URL")
    if args.poll_seconds <= 0 or args.lookback_seconds < 60:
        parser.error("Cadence positive et historique >= 60 s requis")
    if args.watch and (args.start or args.end):
        parser.error("Utiliser --watch ou --from/--to, pas les deux")
    if not args.watch and not (args.start and args.end):
        parser.error("Indiquer --from et --to, ou --watch")
    bundle = joblib.load(args.model)
    last_seen = {}
    first = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        while True:
            end = pd.Timestamp.now(tz="UTC") if args.watch else utc_date(args.end)
            start = end - pd.Timedelta(seconds=args.lookback_seconds) if args.watch else utc_date(args.start)
            if start >= end:
                raise ValueError("La date de début doit précéder la fin")
            try:
                data = fetch_telemetry(args.api_url, start.isoformat(), end.isoformat(), args.dev, args.endpoint, allow_empty=True)
                if not data.empty:
                    if not data.timestamp.between(start, end).all():
                        raise ValueError("L'API n'a pas respecté la période demandée")
                    if args.dev and not data.device_id.eq(args.dev).all():
                        raise ValueError("L'API n'a pas respecté le filtre appareil")
                results = predict(data, bundle)
                if args.watch and not results.empty:
                    results = results.sort_values("ts")
                    if not last_seen:
                        results = results.groupby("dev", sort=False).tail(1)
                    results = results.loc[[r.ts > last_seen.get(r.dev, pd.Timestamp.min.tz_localize("UTC"))
                                           for r in results.itertuples()]]
                if results.empty:
                    print("En attente de nouvelles mesures et d'une minute d'historique.", flush=True)
                else:
                    results.to_csv(args.output, index=False, mode="w" if first else "a", header=first)
                    first = False
                    for record in results.to_dict("records"):
                        last_seen[record["dev"]] = record["ts"]
                        record["ts"] = record["ts"].isoformat()
                        print(json.dumps(record, ensure_ascii=False), flush=True)
            except (RuntimeError, ValueError) as exc:
                if not args.watch:
                    raise
                print(f"Détection indisponible : {exc}", file=sys.stderr, flush=True)
            if not args.watch:
                break
            time.sleep(args.poll_seconds)
    except KeyboardInterrupt:
        print("Détection arrêtée.")


if __name__ == "__main__":
    main()
