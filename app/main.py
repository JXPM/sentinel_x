from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

/*GET*/
@app.get("/")
def root():
    return {"message": "Sentinel-X API fonctionne"}


class Alert(BaseModel):
    temperature: float
    humidity: float
    gas: float
    presence: bool

/*POST*/
@app.post("/api/v1/alerts")
def create_alert(alert: Alert):
    return {
        "message": "Alerte reçue",
        "data": alert
    }