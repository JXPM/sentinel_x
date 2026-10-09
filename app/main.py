from datetime import datetime, timezone
from typing import Literal

from datetime import timedelta

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from app import auth, db, mq2, mqtt_bridge, rules, settings

app = FastAPI()

  
alerts: list[dict] = []


# GET
@app.get("/")
def root():
      return {"message": "Sentinel-X API fonctionne"}


class Alert(BaseModel):
      source: Literal["vision", "anomaly", "device", "fusion"]
      type: Literal["intrusion", "overheat", "gas_leak", "anomaly", "device_offline"]
      severity: Literal["info", "warning", "critical"]
      dev: str = Field(max_length=32)
      message: str = Field(max_length=200)
      confidence: float | None = Field(default=None, ge=0, le=1)
      data: dict = Field(default_factory=dict)


# POST
@app.post("/api/v1/alerts", status_code=201)
def create_alert(alert: Alert):
      a = alert.model_dump()
      stored = db.insert_alert(a)   # PostgreSQL si disponible
      if not stored:
          record = {"id": len(alerts) + 1, "ts": datetime.now(timezone.utc).isoformat(), **a}
          alerts.append(record)
          stored = {"id": record["id"], "ts": record["ts"]}
      # Réaction automatique du boîtier (onglet « Règles » du dashboard)
      fired = rules.on_alert(a, mqtt_bridge.publish_cmd)
      return {**stored, "rules": fired} if fired else stored


  # GET historique
@app.get("/api/v1/alerts")
def list_alerts(limit: int = 50):
      rows = db.list_alerts(limit)
      return rows if rows is not None else alerts[-limit:]
# GET mesures d'une période, gaz en ppm (lu par le service ai/anomalies)
@app.get("/api/v1/telemetry")
def telemetry(start: datetime = Query(alias="from"), end: datetime = Query(alias="to"), dev: str | None = None):
      if end <= start or end - start > timedelta(hours=24):
          raise HTTPException(422, "Période invalide (24 h au plus)")
      rows = db.telemetry_range(start, end, dev)
      if rows is None:
          raise HTTPException(503, "Base de données indisponible")
      return rows


# GET calibration du MQ-2 : à lancer capteur préchauffé, dans l'air propre
@app.get("/api/v1/mq2/calibration")
def mq2_calibration(dev: str | None = None, seconds: int = 120):
      raws = db.recent_gas_raw(dev, seconds)
      if not raws:
          raise HTTPException(503, "Pas de mesures récentes en base : boîtier connecté et base disponible ?")
      mean = sum(raws) / len(raws)
      return {"samples": len(raws), "raw_mean": round(mean, 2), "raw_min": min(raws), "raw_max": max(raws),
              "MQ2_R0_KOHM": mq2.r0_from_clean_air(mean), "current_R0_KOHM": mq2.R0_KOHM or None,
              "note": "Mettre MQ2_R0_KOHM dans docker-compose.override.yml (service api) puis redémarrer l'API."}


# --- Connexion, réglages, pont MQTT -> WebSocket vers le dashboard (boîtier ESP) ---
auth.setup(app)
settings.setup(app, mqtt_bridge.publish_vision_config)
mqtt_bridge.setup(app)
