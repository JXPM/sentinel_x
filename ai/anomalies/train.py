"""Entraînement et évaluation locale : python ai/anomalies/train.py."""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURE_COLUMNS, WINDOWS, build_features, chronological_split, validate_data

ROOT = Path(__file__).resolve().parent


def evaluate(predictions):
    """Métriques par mesure et détection des épisodes étiquetés, par appareil."""
    expected = predictions.expected_scenario.ne("normal")
    detected = predictions.anomaly
    precision, recall, f1, _ = precision_recall_fscore_support(
        expected, detected, average="binary", zero_division=0
    )
    normal = ~expected
    episodes = []
    for device_id, device in predictions.groupby("device_id"):
        device = device.sort_values("timestamp")
        # Une interruption ou un changement d'étiquette démarre un nouvel épisode.
        changes = (device.expected_scenario.ne(device.expected_scenario.shift())
                   | device.timestamp.diff().dt.total_seconds().gt(15)).cumsum()
        for _, episode in device.groupby(changes):
            if episode.iloc[0].expected_scenario == "normal":
                continue
            hits = episode.loc[episode.anomaly]
            start = episode.timestamp.iloc[0]
            first = hits.timestamp.iloc[0] if len(hits) else None
            episodes.append({"device_id": device_id,
                             "scenario": episode.expected_scenario.iloc[0],
                             "start": start.isoformat(), "end": episode.timestamp.iloc[-1].isoformat(),
                             "detected": first is not None,
                             "first_detection": first.isoformat() if first is not None else None,
                             "delay_seconds": (first - start).total_seconds() if first is not None else None})
    false_positives = int((normal & detected).sum())
    return {"evaluation_rows": len(predictions), "normal_rows": int(normal.sum()),
            "anomalous_rows": int(expected.sum()), "false_positive_rows": false_positives,
            "false_positive_rate": false_positives / int(normal.sum()) if normal.any() else None,
            "precision": float(precision), "recall": float(recall), "f1": float(f1),
            "confusion_matrix": confusion_matrix(expected, detected, labels=[False, True]).tolist(),
            "confusion_matrix_order": ["normal", "anomaly"], "episodes": episodes}


def plot_results(predictions, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    for device_id, device in predictions.groupby("device_id"):
        fig, axes = plt.subplots(4, 1, figsize=(13, 10), sharex=True)
        for axis, sensor, label in zip(axes[:3], ("temperature", "humidity", "gas"),
                                       ("Température (°C)", "Humidité (%)", "Gaz (ADC)")):
            axis.plot(device.timestamp, device[sensor], linewidth=1)
            hits = device.loc[device.anomaly]
            axis.scatter(hits.timestamp, hits[sensor], s=9, color="red", label="Détection IF")
            axis.set_ylabel(label)
            axis.grid(alpha=.25)
        axes[0].legend(loc="upper left")
        axes[3].plot(device.timestamp, device.decision_function, label="Score brut : négatif = anomalie")
        axes[3].axhline(0, color="red", linestyle="--", label="Frontière du modèle")
        axes[3].set_ylabel("decision_function")
        axes[3].legend(loc="upper left")
        known = device.expected_scenario.ne("normal")
        for axis in axes:
            axis.fill_between(device.timestamp, 0, 1, where=known, color="orange", alpha=.12,
                              transform=axis.get_xaxis_transform())
        axes[-1].set_xlabel("Temps UTC — zones orange : scénarios injectés")
        fig.suptitle(f"Isolation Forest — évaluation synthétique — {device_id}")
        fig.autofmt_xdate()
        fig.tight_layout()
        # Index sûr pour les noms de fichiers, quel que soit l'identifiant reçu.
        index = list(predictions.device_id.unique()).index(device_id)
        fig.savefig(path / f"evaluation_device_{index}.png", dpi=150)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=ROOT / "data/sensor_data.csv")
    parser.add_argument("--cutoff", default="2026-10-05T10:50:00Z")
    parser.add_argument("--contamination", type=float, default=.01)
    parser.add_argument("--output", type=Path, default=ROOT / "models")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports/isolation_forest")
    args = parser.parse_args()
    if not 0 < args.contamination <= .5:
        parser.error("--contamination doit être dans ]0, 0.5]")
    clean, quality = validate_data(pd.read_csv(args.csv))
    if "expected_scenario" not in clean or clean.expected_scenario.isna().any():
        raise ValueError("Une étiquette expected_scenario par mesure est nécessaire à cette évaluation")
    features = build_features(clean)
    train, evaluation, gap = chronological_split(features, pd.Timestamp(args.cutoff))
    if train.empty or evaluation.empty:
        raise ValueError("Entraînement/évaluation vide : adapter --cutoff")
    if not train.expected_scenario.eq("normal").all():
        raise ValueError("Isolation Forest doit être entraîné sur une période normale")
    # Aucun choix d'hyperparamètres n'utilise les résultats d'évaluation.
    model = make_pipeline(StandardScaler(), IsolationForest(
        n_estimators=200, contamination=args.contamination, random_state=42, n_jobs=-1))
    model.fit(train[FEATURE_COLUMNS])
    predictions = evaluation.copy()
    predictions["decision_function"] = model.decision_function(evaluation[FEATURE_COLUMNS])
    predictions["anomaly"] = model.predict(evaluation[FEATURE_COLUMNS]) == -1
    args.output.mkdir(parents=True, exist_ok=True)
    bundle = {"model": model, "feature_columns": FEATURE_COLUMNS, "windows_seconds": WINDOWS,
              "max_gap_seconds": 15, "sklearn_version": sklearn.__version__, "cutoff": args.cutoff}
    model_path = args.output / "iforest.joblib"
    joblib.dump(bundle, model_path)
    restored = joblib.load(model_path)
    np.testing.assert_array_equal(restored["model"].predict(evaluation[restored["feature_columns"]]),
                                  model.predict(evaluation[FEATURE_COLUMNS]))
    np.testing.assert_allclose(restored["model"].decision_function(evaluation[FEATURE_COLUMNS]),
                               predictions.decision_function, rtol=0, atol=0)
    metrics = evaluate(predictions)
    metrics.update({"train_rows": len(train), "gap_rows": len(gap), "feature_count": len(FEATURE_COLUMNS),
                    "contamination": args.contamination, "n_estimators": 200, "random_state": 42,
                    "cutoff": args.cutoff, "windows_seconds": list(WINDOWS), "embargo_seconds": 60,
                    "reload_verified": True, "quality": quality,
                    "limitations": ["Données synthétiques, deux épisodes seulement",
                                    "Métriques par mesure, fenêtres temporelles dépendantes",
                                    "Retours au normal encore affectés par 60 s d'historique",
                                    "Délai mesuré depuis le début étiqueté dans l'évaluation",
                                    "Prédictions brutes sans confirmation temporelle ni cooldown"]})
    args.report_dir.mkdir(parents=True, exist_ok=True)
    predictions.to_csv(args.report_dir / "predictions.csv", index=False)
    (args.report_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    plot_results(predictions, args.report_dir)
    print(json.dumps({key: value for key, value in metrics.items() if key != "quality"}, indent=2, ensure_ascii=False))
    print(f"Modèle : {model_path}\nRapports : {args.report_dir}")


if __name__ == "__main__":
    main()
