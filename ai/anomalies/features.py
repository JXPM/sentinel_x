"""Contrôle du contrat et 13 variables causales sur 60 secondes, sans nettoyage."""

import numpy as np
import pandas as pd

WINDOW_SECONDS = 60
SENSORS = ("temperature", "humidity", "gas")
FEATURE_COLUMNS = list(SENSORS) + [
    f"{sensor}_{stat}_60s" for sensor in SENSORS for stat in ("mean", "std", "slope")
] + ["corr_temperature_gas_60s"]


def check_data(data):
    """Refuse un contrat invalide sans modifier, supprimer ou imputer de mesures."""
    required = ["timestamp", "device_id", *SENSORS]
    if set(required) - set(data):
        raise ValueError("Colonnes requises absentes")
    if data.empty or data[required].isna().any().any():
        raise ValueError("Données vides ou valeurs essentielles manquantes : vérifier l'API")
    if not isinstance(data.timestamp.dtype, pd.DatetimeTZDtype):
        raise ValueError("Les horodatages doivent être des dates avec fuseau horaire")
    if data.device_id.astype(str).str.strip().eq("").any():
        raise ValueError("Identifiant appareil vide")
    if not np.isfinite(data[list(SENSORS)].to_numpy(dtype=float)).all():
        raise ValueError("Valeurs capteurs non finies")
    if (data.gas < 0).any():
        raise ValueError("Concentration de gaz négative")
    if data.duplicated(["device_id", "timestamp"]).any():
        raise ValueError("Horodatages dupliqués par appareil : vérifier l'API")


def _slope(values):
    seconds = (values.index - values.index[0]).total_seconds().to_numpy()
    seconds = seconds - seconds.mean()
    denominator = np.dot(seconds, seconds)
    return float(np.dot(seconds, values.to_numpy() - values.mean()) / denominator) if denominator else np.nan


def build_features(data, max_gap_seconds=15):
    """Fenêtre [t-60s,t], séparée par appareil, réinitialisée après interruption."""
    check_data(data)
    if max_gap_seconds <= 0:
        raise ValueError("max_gap_seconds doit être positif")
    frames = []
    for _, device in data.groupby("device_id", sort=False):
        device = device.sort_values("timestamp")
        segments = device.timestamp.diff().dt.total_seconds().gt(max_gap_seconds).cumsum()
        for _, segment in device.groupby(segments):
            out = segment.set_index("timestamp").copy()
            for sensor in SENSORS:
                rolling = out[sensor].rolling("60s", closed="both", min_periods=2)
                out[f"{sensor}_mean_60s"] = rolling.mean()
                out[f"{sensor}_std_60s"] = rolling.std(ddof=0)
                out[f"{sensor}_slope_60s"] = rolling.apply(_slope, raw=False)
            corr = out.temperature.rolling("60s", closed="both", min_periods=2).corr(out.gas)
            t_window = out.temperature.rolling("60s", closed="both", min_periods=2)
            g_window = out.gas.rolling("60s", closed="both", min_periods=2)
            constant = t_window.max().eq(t_window.min()) | g_window.max().eq(g_window.min())
            out["corr_temperature_gas_60s"] = corr.clip(-1, 1).mask(constant, 0).fillna(0)
            ready = (out.index - out.index[0]).total_seconds() >= WINDOW_SECONDS
            frames.append(out.loc[ready].reset_index())
    result = pd.concat(frames, ignore_index=True)
    if not result.empty and not np.isfinite(result[FEATURE_COLUMNS].to_numpy(dtype=float)).all():
        raise ValueError("Variables non finies après préparation")
    return result
