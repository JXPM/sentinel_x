"""Service continu sur le serveur : applique le modèle aux mesures réelles et envoie les alertes à l'API.

Réutilise detect.predict() et api_client.fetch_telemetry() sans les modifier.
Toutes les POLL_S secondes : mesures des LOOKBACK_S dernières secondes (gaz en ppm, GET /api/v1/telemetry),
prédiction Isolation Forest, puis alerte (POST /api/v1/alerts) seulement après CONFIRM fenêtres anormales
consécutives, au plus une alerte par COOLDOWN_S et par appareil.

Variables : SENTINEL_API_URL (http://api:8000), DEV (edge01), CONFIRM (3), COOLDOWN_S (60), POLL_S (2).
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

import joblib
import pandas as pd

from api_client import fetch_telemetry
from detect import predict

ROOT = Path(__file__).resolve().parent
API = os.getenv("SENTINEL_API_URL", "http://api:8000")
DEV = os.getenv("DEV", "edge01")
CONFIRM = int(os.getenv("CONFIRM", "3"))
COOLDOWN_S = float(os.getenv("COOLDOWN_S", "60"))
POLL_S = float(os.getenv("POLL_S", "2"))
LOOKBACK_S = 180
MODEL = Path(os.getenv("MODEL", ROOT / "models/iforest_synthetic_ppm_60s.joblib"))


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def send_alert(dev, row, streak):
    alert = {"source": "anomaly", "type": "anomaly", "severity": "warning", "dev": dev[:32],
             "message": f"Comportement inhabituel des capteurs ({streak} fenêtres de 60 s consécutives)"[:200],
             "data": {"iforest": round(float(row.iforest), 4), "ts": row.ts.isoformat(), "model": MODEL.name}}
    req = Request(API.rstrip("/") + "/api/v1/alerts", data=json.dumps(alert).encode(),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=5) as r:
        return json.load(r)


def main():
    bundle = joblib.load(MODEL)
    log(f"modèle chargé : {MODEL.name}, appareil {DEV}, confirmation {CONFIRM} fenêtres")
    last_ts, streak, last_alert = None, 0, 0.0
    while True:
        try:
            end = pd.Timestamp.now(tz="UTC")
            data = fetch_telemetry(API, (end - pd.Timedelta(seconds=LOOKBACK_S)).isoformat(), end.isoformat(),
                                   DEV, allow_empty=True)
            results = predict(data, bundle)
            if results.empty:
                log("en attente d'une minute de mesures en ppm (capteur calibré ?)")
            else:
                new = results.sort_values("ts")
                if last_ts is not None:
                    new = new[new.ts > last_ts]
                for row in new.itertuples():
                    streak = streak + 1 if row.anomaly else 0
                    last_ts = row.ts
                    if streak >= CONFIRM and time.time() - last_alert > COOLDOWN_S:
                        stored = send_alert(DEV, row, streak)
                        last_alert = time.time()
                        log(f"ALERTE anomalie envoyée (id {stored.get('id')}, score {row.iforest:.3f})")
        except (RuntimeError, ValueError, OSError) as exc:
            log(f"détection indisponible : {exc}")
        time.sleep(POLL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
