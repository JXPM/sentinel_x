"""Validation et variables causales, partagées par entraînement et prédiction."""

import numpy as np
import pandas as pd

SENSORS = ("temperature", "humidity", "gas")
WINDOWS = (60,)
DIAGNOSTIC_WINDOWS = (60, 300)
ALL_FEATURE_COLUMNS = list(SENSORS) + [
    f"{sensor}_{stat}_{seconds}s"
    for seconds in DIAGNOSTIC_WINDOWS
    for sensor in SENSORS
    for stat in ("mean", "std", "slope")
] + [f"corr_temperature_gas_{seconds}s" for seconds in DIAGNOSTIC_WINDOWS]
FEATURE_COLUMNS = [c for c in ALL_FEATURE_COLUMNS if c in SENSORS or c.endswith("_60s")]


def validate_data(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Rejette les erreurs de mesure, sans écrêter les incidents ni interpoler."""
    required = ["timestamp", "device_id", *SENSORS]
    missing = sorted(set(required) - set(raw.columns))
    if missing:
        raise ValueError(f"Colonnes absentes : {missing}")
    data = raw.copy()
    report = {"input_rows": len(data), "missing_values": raw.isna().sum().to_dict()}
    data["timestamp"] = pd.to_datetime(data["timestamp"], utc=True, errors="coerce")
    for sensor in SENSORS:
        data[sensor] = pd.to_numeric(data[sensor], errors="coerce")
    valid_device = data["device_id"].notna() & data["device_id"].astype(str).str.strip().ne("")
    # Plages de mesure du DHT22 et de l'ADC ESP8266, pas seuils d'alerte.
    valid = (data["timestamp"].notna() & valid_device
             & data["temperature"].between(-40, 80)
             & data["humidity"].between(0, 100)
             & data["gas"].between(0, 1023))
    report["invalid_rows"] = int((~valid).sum())
    data = data.loc[valid].copy()
    data["device_id"] = data["device_id"].astype(str).str.strip()
    duplicate = data.duplicated(["device_id", "timestamp"], keep=False)
    # Ne choisit pas arbitrairement entre deux mesures contradictoires.
    conflicting = data.loc[duplicate].groupby(["device_id", "timestamp"])[list(SENSORS)].nunique()
    if (conflicting > 1).any().any():
        raise ValueError("Mesures contradictoires pour un même appareil et horodatage")
    before = len(data)
    data = data.drop_duplicates(["device_id", "timestamp"]).sort_values(
        ["device_id", "timestamp"]
    ).reset_index(drop=True)
    report["duplicate_rows_removed"] = before - len(data)
    report["output_rows"] = len(data)
    intervals = data.groupby("device_id")["timestamp"].diff().dt.total_seconds().dropna()
    report["interval_seconds"] = {
        "min": float(intervals.min()) if len(intervals) else None,
        "median": float(intervals.median()) if len(intervals) else None,
        "max": float(intervals.max()) if len(intervals) else None,
    }
    return data, report


def _slope(series: pd.Series) -> float:
    """Régression sur les vrais horodatages ; unité capteur par seconde."""
    x = (series.index - series.index[0]).total_seconds().to_numpy()
    x = x - x.mean()
    denominator = np.dot(x, x)
    return float(np.dot(x, series.to_numpy() - series.mean()) / denominator) if denominator else np.nan


def build_features(clean: pd.DataFrame, max_gap_seconds: float = 15, windows=WINDOWS) -> pd.DataFrame:
    """Utilise uniquement le présent/passé, par appareil et sans franchir une panne.

    Les fenêtres sont inclusives [t - durée, t]. Une histoire complète de
    max(windows) secondes est nécessaire (60 par défaut).
    En direct, conserver cette histoire puis
    appeler cette même fonction ; la dernière ligne est la prédiction courante.
    """
    if max_gap_seconds <= 0:
        raise ValueError("max_gap_seconds doit être positif")
    windows = tuple(windows)
    if not windows or any(w not in DIAGNOSTIC_WINDOWS for w in windows) or len(set(windows)) != len(windows):
        raise ValueError("windows doit être un sous-ensemble non vide de (60, 300)")
    columns = [c for c in ALL_FEATURE_COLUMNS if c in SENSORS or any(c.endswith(f"_{w}s") for w in windows)]
    parts = []
    for _, device in clean.groupby("device_id", sort=False):
        device = device.sort_values("timestamp")
        segments = device["timestamp"].diff().dt.total_seconds().gt(max_gap_seconds).cumsum()
        for _, segment in device.groupby(segments):
            out = segment.set_index("timestamp").copy()
            for seconds in windows:
                for sensor in SENSORS:
                    window = out[sensor].rolling(f"{seconds}s", closed="both", min_periods=2)
                    out[f"{sensor}_mean_{seconds}s"] = window.mean()
                    out[f"{sensor}_std_{seconds}s"] = window.std(ddof=0)
                    out[f"{sensor}_slope_{seconds}s"] = window.apply(_slope, raw=False)
                rolling = out["temperature"].rolling(f"{seconds}s", closed="both", min_periods=2)
                out[f"corr_temperature_gas_{seconds}s"] = rolling.corr(out["gas"]).clip(-1, 1).fillna(0)
            # Corrélation 0 par convention lorsque l'un des signaux est constant.
            ready = (out.index - out.index[0]).total_seconds() >= max(windows)
            parts.append(out.loc[ready].reset_index())
    if not parts:
        return pd.DataFrame(columns=[*clean.columns, *columns[3:]])
    return pd.concat(parts, ignore_index=True).replace([np.inf, -np.inf], np.nan).dropna(subset=columns)


def chronological_split(features: pd.DataFrame, cutoff: pd.Timestamp, embargo_seconds: int = 60) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Embargo de 60 s par défaut ; 300 s pour les comparaisons historiques."""
    if embargo_seconds < 60:
        raise ValueError("L'embargo doit couvrir au moins la fenêtre de 60 s")
    cutoff = pd.Timestamp(cutoff)
    if cutoff.tzinfo is None:
        raise ValueError("La date de séparation doit inclure un fuseau horaire")
    end_gap = cutoff + pd.Timedelta(seconds=embargo_seconds)
    train = features.loc[features.timestamp < cutoff].copy()
    gap = features.loc[(features.timestamp >= cutoff) & (features.timestamp < end_gap)].copy()
    evaluation = features.loc[features.timestamp >= end_gap].copy()
    return train, evaluation, gap
