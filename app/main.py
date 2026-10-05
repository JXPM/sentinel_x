from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

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
      record = {
          "id": len(alerts) + 1,
          "ts": datetime.now(timezone.utc).isoformat(),
          **alert.model_dump(),
      }
      alerts.append(record)
      return {"id": record["id"], "ts": record["ts"]}


  # GET historique
@app.get("/api/v1/alerts")
def list_alerts(limit: int = 50):
      return alerts[-limit:]