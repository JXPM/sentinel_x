from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

#GET 
@app.get("/")
def root():
    return {"message": "Sentinel-X API fonctionne"}


class Alert(BaseModel):
    temperature: float
    humidity: float
    gas: float
    presence: bool

alerts = []

#POST
@app.post("/api/v1/alerts")
def create_alert(alert: Alert):
    alerts.append(alert)
    return {
        "message": "Alerte reçue",
        "data": alert
    }

    
# GET des alertes
@app.get("/api/v1/alerts")
def get_alerts():
    return alerts