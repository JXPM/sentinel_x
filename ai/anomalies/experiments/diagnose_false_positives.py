"""Diagnostic descriptif du modèle existant, sans modifier ses paramètres."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if __package__ in (None, ""):
    sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd

from features import FEATURE_COLUMNS, ALL_FEATURE_COLUMNS, build_features, chronological_split, validate_data



def diagnose(train, predictions, feature_columns=None):
    """Compare les périodes et les plages observées, sans attribution causale."""
    parts = []
    for _, device in predictions.groupby("device_id"):
        device = device.sort_values("timestamp").copy()
        normal = device.expected_scenario.eq("normal")
        incident_time = device.timestamp.where(~normal).ffill()
        seconds_since_incident = (device.timestamp - incident_time).dt.total_seconds()
        device["period"] = np.select(
            [~normal, normal & seconds_since_incident.le(300), normal & incident_time.isna()],
            ["incident", "recovery_300s", "normal_before_incidents"], default="normal_other")
        parts.append(device)
    annotated = pd.concat(parts, ignore_index=True)
    periods = []
    for period, rows in annotated.groupby("period"):
        hits = int(rows.anomaly.sum())
        periods.append({"period": period, "rows": len(rows), "detections": hits,
                        "detection_rate": hits / len(rows)})
    before = annotated.loc[annotated.period.eq("normal_before_incidents")]
    fp = before.loc[before.anomaly]
    ranking = []
    for feature in (feature_columns if feature_columns is not None else FEATURE_COLUMNS):
        low, high = train[feature].min(), train[feature].max()
        outside = (fp[feature] < low) | (fp[feature] > high)
        ranking.append({"feature": feature, "train_min": float(low), "train_max": float(high),
                        "train_mean": float(train[feature].mean()),
                        "false_positive_mean": float(fp[feature].mean()) if len(fp) else None,
                        "outside_train_range_rows": int(outside.sum()),
                        "outside_train_range_rate": float(outside.mean()) if len(fp) else None})
    ranking = pd.DataFrame(ranking).sort_values("outside_train_range_rows", ascending=False)
    return annotated, periods, ranking


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports/isolation_forest")
    parser.add_argument("--csv", type=Path, default=ROOT / "data/sensor_data.csv")
    args = parser.parse_args()
    metrics = json.loads((args.report_dir / "metrics.json").read_text(encoding="utf-8"))
    predictions = pd.read_csv(args.report_dir / "predictions.csv")
    predictions["timestamp"] = pd.to_datetime(predictions.timestamp, utc=True)
    if not predictions.anomaly.isin([True, False]).all():
        raise ValueError("La colonne anomaly doit contenir des booléens")
    clean, _ = validate_data(pd.read_csv(args.csv))
    windows = (60, 300) if metrics["feature_count"] == 23 else (60,)
    selected_columns = ALL_FEATURE_COLUMNS if len(windows) == 2 else FEATURE_COLUMNS
    train, evaluation, _ = chronological_split(build_features(clean, windows=windows), pd.Timestamp(metrics["cutoff"]), embargo_seconds=max(windows))
    # Vérifier que le diagnostic compare exactement la même acquisition.
    columns = ["device_id", "timestamp", "expected_scenario", *selected_columns]
    expected = evaluation[columns].sort_values(["device_id", "timestamp"]).reset_index(drop=True)
    actual = predictions[columns].sort_values(["device_id", "timestamp"]).reset_index(drop=True)
    pd.testing.assert_frame_equal(expected, actual, check_dtype=False, rtol=1e-9, atol=1e-9)
    annotated, periods, ranking = diagnose(train, predictions, selected_columns)
    output = args.report_dir / "diagnostic"
    output.mkdir(parents=True, exist_ok=True)
    ranking.to_csv(output / "feature_comparison.csv", index=False)
    fp = annotated.loc[annotated.period.eq("normal_before_incidents") & annotated.anomaly]
    fp.to_csv(output / "false_positives_before_incidents.csv", index=False)
    summary = {"periods": periods, "top_features": ranking.head(8).to_dict("records"),
               "interpretation": "Des écarts aux plages d'entraînement ne prouvent pas quelles variables causent le verdict.",
               "model_modified": False}
    (output / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    for index, (_, device) in enumerate(annotated.groupby("device_id")):
        before = device.loc[device.period.eq("normal_before_incidents")]
        if before.empty:
            continue
        # Variables les plus décalées, sélectionnées à des fins de diagnostic seulement.
        selected = ranking.feature.head(4).tolist()
        fig, axes = plt.subplots(5, 1, figsize=(12, 11), sharex=True)
        for axis, feature in zip(axes[:4], selected):
            axis.axhspan(train[feature].min(), train[feature].max(), color="green", alpha=.12,
                         label="Plage observée à l'entraînement")
            axis.plot(before.timestamp, before[feature], linewidth=1)
            hits = before.loc[before.anomaly]
            axis.scatter(hits.timestamp, hits[feature], color="red", s=12, label="Fausse détection")
            axis.set_ylabel(feature, fontsize=8)
            axis.grid(alpha=.2)
        axes[0].legend(fontsize=8)
        axes[-1].plot(before.timestamp, before.decision_function)
        axes[-1].axhline(0, color="red", linestyle="--")
        axes[-1].set_ylabel("Score brut")
        axes[-1].set_xlabel("Temps UTC — normal avant incidents")
        fig.autofmt_xdate()
        fig.tight_layout()
        fig.savefig(output / f"normal_device_{index}.png", dpi=140)
        plt.close(fig)
    print(json.dumps(periods, indent=2, ensure_ascii=False))
    print(ranking.head(8).to_string(index=False))
    print(f"Diagnostic : {output}")


if __name__ == "__main__":
    main()
