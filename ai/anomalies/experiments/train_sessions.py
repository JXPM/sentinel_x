"""Apprentissage par sessions : python ai/anomalies/experiments/train_sessions.py."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if __package__ in (None, ""):
    sys.path.insert(0, str(ROOT))

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURE_COLUMNS, SENSORS, build_features, validate_data
from train import evaluate, plot_results
from experiments.compare_windows import recovery_metrics

COLUMNS = [c for c in FEATURE_COLUMNS if c in SENSORS or c.endswith("_60s")]


def load_sessions(root, manifest, split):
    """Lit uniquement le split demandé et prépare chaque session isolément."""
    if split not in ("train", "validation"):
        raise ValueError("Ce programme ne lit pas le test final")
    frames, summaries = [], []
    entries = [s for s in manifest["sessions"] if s["split"] == split]
    if not entries or len({s["session_id"] for s in entries}) != len(entries):
        raise ValueError("Sessions absentes ou identifiants dupliqués")
    for entry in entries:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to((root / split).resolve()):
            raise ValueError("Chemin de session hors de son ensemble")
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Session modifiée : {path.name}")
        raw = pd.read_csv(path)
        if len(raw) != entry["rows"] or not raw.session_id.eq(entry["session_id"]).all():
            raise ValueError(f"Métadonnées incohérentes : {path.name}")
        if raw.expected_scenario.isna().any():
            raise ValueError("Étiquettes manquantes")
        if split == "train" and not raw.expected_scenario.eq("normal").all():
            raise ValueError("L'apprentissage doit être exclusivement normal")
        clean, quality = validate_data(raw)
        frame = build_features(clean, windows=(60,))
        if frame.empty:
            raise ValueError(f"Session sans historique exploitable : {path.name}")
        frames.append(frame)
        summaries.append({"session_id": entry["session_id"], "raw_rows": len(raw),
                          "feature_rows": len(frame), "quality": quality})
        print(f"Préparation {entry['session_id']} : {len(frame)} lignes", flush=True)
    return pd.concat(frames, ignore_index=True), summaries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data/sessions_v1")
    parser.add_argument("--contamination", type=float, default=.01)
    parser.add_argument("--model-path", type=Path, default=ROOT / "models/iforest_sessions_60s.joblib")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports/sessions_60s")
    args = parser.parse_args()
    if not 0 < args.contamination <= .5:
        parser.error("contamination doit appartenir à ]0, 0.5]")
    manifest = json.loads((args.data_dir / "manifest.json").read_text(encoding="utf-8"))
    train, train_info = load_sessions(args.data_dir, manifest, "train")
    validation, validation_info = load_sessions(args.data_dir, manifest, "validation")
    assert set(train.session_id).isdisjoint(set(validation.session_id))
    model = make_pipeline(StandardScaler(), IsolationForest(
        n_estimators=200, contamination=args.contamination, random_state=42, n_jobs=-1))
    model.fit(train[COLUMNS])
    predictions = validation.copy()
    predictions["decision_function"] = model.decision_function(validation[COLUMNS])
    predictions["anomaly"] = model.predict(validation[COLUMNS]) == -1
    bundle = {"model": model, "feature_columns": COLUMNS, "windows_seconds": (60,),
              "max_gap_seconds": 15, "sklearn_version": sklearn.__version__,
              "train_sessions": train.session_id.unique().tolist(),
              "parameters": {"n_estimators": 200, "contamination": args.contamination, "random_state": 42},
              "status": "candidate_validated_not_final", "data_origin": manifest["data_origin"]}
    args.model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.model_path)
    restored = joblib.load(args.model_path)
    np.testing.assert_array_equal(restored["model"].predict(validation[COLUMNS]), model.predict(validation[COLUMNS]))
    np.testing.assert_allclose(restored["model"].decision_function(validation[COLUMNS]), predictions.decision_function,
                               rtol=0, atol=0)
    # Le score global est calculé par mesure ; les épisodes restent isolés par session.
    metrics = evaluate(predictions)
    metrics.pop("episodes")
    session_results = []
    args.report_dir.mkdir(parents=True, exist_ok=True)
    for session_id, session in predictions.groupby("session_id"):
        result = evaluate(session)
        result.update({"session_id": session_id, "recovery": recovery_metrics(session)})
        session_results.append(result)
        plot_dir = args.report_dir / session_id
        plot_dir.mkdir(exist_ok=True)
        plot_results(session, plot_dir)
    episodes = [e for s in session_results for e in s["episodes"]]
    metrics.update({"evaluation_split": "validation", "test_evaluated": False,
                    "train_rows": len(train), "feature_count": len(COLUMNS),
                    "episodes_detected": sum(e["detected"] for e in episodes), "episodes_total": len(episodes),
                    "sessions": session_results, "train_quality": train_info,
                    "validation_quality": validation_info, "reload_verified": True,
                    "parameters": bundle["parameters"],
                    "limitations": ["Sessions synthétiques de la même famille de simulation",
                                    "Prédictions par mesure, sans gestion des alertes",
                                    "Comparaison directe avec l'ancien CSV non valable : données différentes"]})
    predictions.to_csv(args.report_dir / "validation_predictions.csv", index=False)
    (args.report_dir / "validation_metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k:v for k,v in metrics.items() if k not in ("sessions", "train_quality", "validation_quality")},
                     indent=2, ensure_ascii=False))
    for session in session_results:
        print(session["session_id"], "fausses détections", session["false_positive_rows"],
              "délais", [(e["scenario"],e["delay_seconds"]) for e in session["episodes"]])
    print(f"Modèle candidat : {args.model_path}\nRapports : {args.report_dir}")


if __name__ == "__main__":
    main()
