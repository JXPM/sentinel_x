"""Compare 60 s, 300 s et les deux sur exactement les mêmes lignes."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if __package__ in (None, ""):
    sys.path.insert(0, str(ROOT))

import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import ALL_FEATURE_COLUMNS as FEATURE_COLUMNS, SENSORS, build_features, chronological_split, validate_data
from train import evaluate
from experiments.diagnose_false_positives import diagnose



def recovery_metrics(predictions):
    """Retour normal : première séquence de verdicts normaux couvrant 60 s.

    Délai depuis la dernière mesure étiquetée incident, avant le suivant.
    Une absence de séquence donne null, pas un retour immédiat.
    """
    results = []
    for device_id, device in predictions.groupby("device_id"):
        device = device.sort_values("timestamp").reset_index(drop=True)
        groups = (device.expected_scenario.ne(device.expected_scenario.shift())
                  | device.timestamp.diff().dt.total_seconds().gt(15)).cumsum()
        episodes = list(device.groupby(groups))
        for index, (_, episode) in enumerate(episodes):
            if episode.expected_scenario.iloc[0] == "normal":
                continue
            end = episode.timestamp.iloc[-1]
            following = episodes[index + 1][1] if index + 1 < len(episodes) else device.iloc[:0]
            if len(following) and following.expected_scenario.iloc[0] != "normal":
                following = device.iloc[:0]
            start = None
            returned = None
            confirmed = None
            for row in following.itertuples():
                if row.anomaly:
                    start = None
                else:
                    if start is None:
                        start = row.timestamp
                    if (row.timestamp - start).total_seconds() >= 60:
                        returned, confirmed = start, row.timestamp
                        break
            results.append({"device_id": device_id, "scenario": episode.expected_scenario.iloc[0],
                            "incident_end": end.isoformat(),
                            "stable_normal_start_delay_s": (returned - end).total_seconds() if returned is not None else None,
                            "stable_normal_confirmation_delay_s": (confirmed - end).total_seconds() if confirmed is not None else None})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=ROOT / "data/sensor_data.csv")
    parser.add_argument("--cutoff", default="2026-10-05T10:50:00Z")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/window_comparison")
    args = parser.parse_args()
    clean, _ = validate_data(pd.read_csv(args.csv))
    if "expected_scenario" not in clean or clean.expected_scenario.isna().any():
        raise ValueError("Étiquettes expected_scenario requises")
    train, evaluation, _ = chronological_split(build_features(clean, windows=(60, 300)), pd.Timestamp(args.cutoff), embargo_seconds=300)
    if train.empty or evaluation.empty or not train.expected_scenario.eq("normal").all():
        raise ValueError("Périodes vides ou entraînement non normal")
    configurations = {
        "60s": [c for c in FEATURE_COLUMNS if c in SENSORS or c.endswith("_60s")],
        "300s": [c for c in FEATURE_COLUMNS if c in SENSORS or c.endswith("_300s")],
        "60s_300s": FEATURE_COLUMNS,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    reports, overview, curves = {}, [], {}
    for name, columns in configurations.items():
        model = make_pipeline(StandardScaler(), IsolationForest(
            n_estimators=200, contamination=.01, random_state=42, n_jobs=-1))
        model.fit(train[columns])
        predictions = evaluation.copy()
        predictions["decision_function"] = model.decision_function(evaluation[columns])
        predictions["anomaly"] = model.predict(evaluation[columns]) == -1
        _, periods, _ = diagnose(train, predictions)
        metrics = evaluate(predictions)
        metrics.update({"feature_columns": columns, "periods": periods,
                        "recovery": recovery_metrics(predictions)})
        reports[name] = metrics
        predictions.to_csv(args.output / f"predictions_{name}.csv", index=False)
        period_map = {p["period"]: p for p in periods}
        overview.append({"configuration": name, "features": len(columns),
                         "false_positives_before": period_map.get("normal_before_incidents", {}).get("detections", 0),
                         "false_positives_recovery": period_map.get("recovery_300s", {}).get("detections", 0),
                         "false_positives_total": metrics["false_positive_rows"],
                         "false_positive_rate": metrics["false_positive_rate"],
                         "incident_rows_detected": int((predictions.anomaly & predictions.expected_scenario.ne("normal")).sum())})
        curves[name] = predictions
    # Le modèle initial sert de contrôle ; l'expérience ne remplace pas son fichier.
    summary = {"train_rows": len(train), "evaluation_rows": len(evaluation),
               "parameters": {"n_estimators": 200, "contamination": .01, "random_state": 42},
               "recovery_definition": "60 secondes consécutives de verdicts normaux, avec intervalle maximal 15 s",
               "diagnostic_only": True, "results": reports}
    (args.output / "comparison.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    pd.DataFrame(overview).to_csv(args.output / "comparison.csv", index=False)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    for index, (device_id, device) in enumerate(evaluation.groupby("device_id")):
        fig, axes = plt.subplots(3, 1, figsize=(13, 8), sharex=True)
        for axis, (name, predictions) in zip(axes, curves.items()):
            rows = predictions.loc[predictions.device_id.eq(device_id)]
            axis.plot(rows.timestamp, rows.decision_function, linewidth=1)
            axis.axhline(0, color="red", linestyle="--")
            axis.fill_between(rows.timestamp, 0, 1, where=rows.expected_scenario.ne("normal"),
                              transform=axis.get_xaxis_transform(), color="orange", alpha=.2)
            axis.set_ylabel(f"{name}\nScore brut")
            axis.grid(alpha=.2)
        axes[-1].set_xlabel("Temps UTC — orange : incident étiqueté ; score négatif : anomalie")
        fig.suptitle(f"Comparaison des fenêtres — {device_id}")
        fig.autofmt_xdate()
        fig.tight_layout()
        fig.savefig(args.output / f"comparison_device_{index}.png", dpi=150)
        plt.close(fig)
    print(pd.DataFrame(overview).to_string(index=False))
    for name, metrics in reports.items():
        print(name, json.dumps({"episodes": metrics["episodes"], "recovery": metrics["recovery"]}, ensure_ascii=False))
    print(f"Rapports : {args.output}")


if __name__ == "__main__":
    main()
