"""Pont MQTT -> WebSocket entre le boîtier ESP8266 et le dashboard.

- s'abonne à sentinel/# sur Mosquitto ;
- relaie la télémétrie, l'état et les alertes du boîtier sur /ws, au format attendu par le dashboard
  ({"kind": "telemetry" | "status" | "alert", "data": {...}}) ;
- enregistre les alertes du boîtier via POST /api/v1/alerts ;
- transmet au boîtier les commandes du dashboard (POST /api/v1/commands, PATCH /api/v1/alerts/{id}/ack)
  et celles des règles automatiques (app/rules.py) ;
- publie les seuils de la vision en message retenu (sentinel/groupe1/cam-01/config, app/settings.py) ;
- enregistre télémétrie, acquittements et commandes dans PostgreSQL quand la base est disponible (app/db.py).
"""
import asyncio
import json
import logging
import os
import threading
import time
import urllib.request
from datetime import datetime, timezone
from typing import Literal

import paho.mqtt.client as mqtt
from fastapi import HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app import auth, db, mq2, settings

log = logging.getLogger("uvicorn.error")

MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")        # nom du service dans docker-compose
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "sentinel/#")
API_SELF = os.getenv("API_SELF", "http://127.0.0.1:8000")
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
MOTION_ALERT_GAP_S = 60       # au plus une alerte "intrusion" par minute (le PIR bat vite)
DEVICE_BASE = os.getenv("DEVICE_BASE", "sentinel/groupe1/edge01")
VISION_BASE = os.getenv("VISION_BASE", "sentinel/groupe1/cam-01")

_clients: set = set()
_loop = None
_client = None
_started = False
_mqtt_ok = False
_device_online = False
_last_telemetry = None
_last_seen = 0.0
_device_base = None           # ex. sentinel/groupe1/edge01, appris à la première mesure
_motion_last = 0.0
_alert_seq = 1_000_000
_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _status() -> dict:
    return {"online": _device_online, "services": {"mosquitto": _mqtt_ok}}


async def _send_all(msg: dict) -> None:
    for ws in list(_clients):
        try:
            await ws.send_json(msg)
        except Exception:
            _clients.discard(ws)


def _broadcast(msg: dict) -> None:
    if _loop is not None and _clients:
        asyncio.run_coroutine_threadsafe(_send_all(msg), _loop)


def _telemetry(dev: str, d: dict) -> dict:
    d = dict(d)
    d.setdefault("device", dev)
    d["device_ts"] = d.get("ts")
    d["ts"] = time.time()                     # heure du serveur : l'ESP n'a pas toujours l'heure
    # gaz en ppm (courbe du MQ-2) dès que le capteur est préchauffé et R0 calibré
    raw = d.get("gas_raw", d.get("gas"))
    d["gas_ppm"] = mq2.ppm(raw) if raw is not None and d.get("gas_ready", True) else None
    if d["gas_ppm"] is not None:
        d["gas"], d["gas_unit"] = d["gas_ppm"], "ppm"
    elif "gas" not in d:
        d["gas"], d["gas_unit"] = raw, "raw"     # le dashboard lit "gas"
    if "presence" not in d:
        d["presence"] = bool(d.get("motion"))  # le dashboard lit "presence"
    return {"kind": "telemetry", "data": d}


_ALERTS = {
    "gas": ("gas_leak", "critical", "Fumée/gaz détecté par le MQ-2 : indice {value} (seuil {threshold})"),
    "temperature": ("overheat", "critical", "Température de {value} °C, au-dessus du seuil de {threshold} °C"),
    "motion": ("intrusion", "warning", "Mouvement détecté par le PIR du boîtier"),
    "sensor_fault": ("device_offline", "warning", "Capteur DHT22 sans réponse"),
}


def _store_alert(alert: dict) -> None:
    global _alert_seq
    stored = None
    try:
        req = urllib.request.Request(
            API_SELF + "/api/v1/alerts", data=json.dumps(alert).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=3) as r:
            body = r.read()
            stored = json.loads(body) if body else None
    except Exception as e:
        log.warning("[pont] alerte non enregistrée dans l'API : %s", e)
    if not (isinstance(stored, dict) and "id" in stored):
        with _lock:
            _alert_seq += 1
            stored = {**alert, "id": _alert_seq}
    stored.setdefault("ts", _now_iso())
    _broadcast({"kind": "alert", "data": stored})


def _alert(dev: str, d: dict) -> None:
    global _motion_last
    if "source" in d and "message" in d:   # alerte déjà au format API (service vision)
        alert = {k: d[k] for k in ("source", "type", "severity", "dev", "message", "confidence", "data") if k in d}
        threading.Thread(target=_store_alert, args=(alert,), daemon=True).start()
        return
    kind = d.get("type")
    if d.get("state") != "raised" or kind not in _ALERTS:
        return
    if kind == "motion":
        if not d.get("armed", True) or time.time() - _motion_last < MOTION_ALERT_GAP_S:
            return
        _motion_last = time.time()
    api_type, severity, text = _ALERTS[kind]
    message = text.format(value=d.get("value", "?"), threshold=d.get("threshold", "?"))
    data = {k: d[k] for k in ("type", "value", "threshold", "armed") if k in d}
    if kind == "motion":
        data["reason"] = "motion"
        if settings.off_hours():          # présence hors des heures ouvrées : plus suspecte
            severity, message, data["off_hours"] = "critical", "Hors horaires : " + message, True
    alert = {
        "source": "device", "type": api_type, "severity": severity, "dev": str(dev)[:32],
        "message": message[:200], "data": data,
    }
    threading.Thread(target=_store_alert, args=(alert,), daemon=True).start()


def _on_connect(client, userdata, flags, reason_code, properties=None):
    global _mqtt_ok
    if reason_code.is_failure:
        log.warning("[pont] connexion MQTT refusée : %s", reason_code)
        return
    _mqtt_ok = True
    client.subscribe(MQTT_TOPIC, qos=1)
    log.info("[pont] connecté à %s:%s, abonné à %s", MQTT_HOST, MQTT_PORT, MQTT_TOPIC)
    threading.Thread(target=_sync_vision_config, daemon=True).start()
    _broadcast({"kind": "status", "data": _status()})


def _on_disconnect(client, userdata, flags, reason_code, properties=None):
    global _mqtt_ok
    _mqtt_ok = False
    log.warning("[pont] MQTT déconnecté (%s), reconnexion automatique", reason_code)
    _broadcast({"kind": "status", "data": _status()})


def _on_message(client, userdata, msg):
    global _device_online, _last_telemetry, _last_seen, _device_base
    parts = msg.topic.split("/")
    if len(parts) < 3:
        return
    kind, dev = parts[-1], parts[-2]
    payload = msg.payload.decode("utf-8", "replace").strip()
    try:
        if kind == "telemetry":
            m = _telemetry(dev, json.loads(payload))
            _last_telemetry, _last_seen = m, time.time()
            db.insert_telemetry(dev, m["data"])
            _device_base = "/".join(parts[:-1])
            if not _device_online:
                _device_online = True
                _broadcast({"kind": "status", "data": _status()})
            _broadcast(m)
        elif kind == "status":
            _device_online = payload.lower() == "online"
            _device_base = "/".join(parts[:-1])
            _broadcast({"kind": "status", "data": _status()})
        elif kind == "alert":
            _alert(dev, json.loads(payload))
    except (ValueError, TypeError) as e:
        log.warning("[pont] message illisible sur %s : %s", msg.topic, e)


def publish_cmd(cmd: dict) -> bool:
    """Commande au boîtier (dashboard ou règle automatique)."""
    if not (_client and _mqtt_ok):
        return False
    _client.publish((_device_base or DEVICE_BASE) + "/cmd", json.dumps(cmd), qos=1)
    return True


def publish_vision_config(cfg: dict) -> bool:
    """Seuils et heures ouvrées de la vision, en message retenu : detect.py les reçoit à chaque (re)connexion."""
    if not (_client and _mqtt_ok):
        return False
    _client.publish(VISION_BASE + "/config", json.dumps(cfg), qos=1, retain=True)
    return True


def _sync_vision_config() -> None:
    """Au démarrage : republie les réglages enregistrés, une fois la base lue.
    Sans base, on ne publie rien, pour ne pas écraser le message retenu par les valeurs par défaut."""
    for _ in range(30):
        if settings.loaded() or settings.load():
            publish_vision_config(settings.vision_config())
            return
        time.sleep(10)


def _publish_config(cfg: dict) -> bool:
    """Réglage conservé par le broker (retained) : le boîtier le relit à chaque reconnexion."""
    if not (_client and _mqtt_ok):
        return False
    _client.publish((_device_base or DEVICE_BASE) + "/config", json.dumps(cfg), qos=1, retain=True)
    log.info("[pont] réglage envoyé au boîtier : %s", cfg)
    return True


class Command(BaseModel):
    """Commande du dashboard : bornes vérifiées ici, et de nouveau par le firmware."""
    target: Literal["buzzer", "auto", "lcd", "led_red", "led_green"]
    action: Literal["on", "off", "auto", "pulse", "text"] | None = None
    ms: int = Field(2000, ge=100, le=10_000)          # durée du buzzer
    text: str | None = Field(None, max_length=64)     # texte LCD, ramené à 32 caractères ASCII
    s: int = Field(5, ge=1, le=30)                    # durée d'affichage du texte


def _start_mqtt() -> None:
    global _client
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="sentinel-api-bridge")
    if MQTT_USER:
        c.username_pw_set(MQTT_USER, MQTT_PASS)
    c.on_connect, c.on_disconnect, c.on_message = _on_connect, _on_disconnect, _on_message
    c.reconnect_delay_set(1, 30)
    c.connect_async(MQTT_HOST, MQTT_PORT, keepalive=30)
    c.loop_start()
    _client = c


def setup(app) -> None:
    global _started
    if _started:
        return
    _started = True

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        global _loop
        await ws.accept()
        _loop = asyncio.get_running_loop()
        _clients.add(ws)
        try:
            await ws.send_json({"kind": "status", "data": _status()})
            if _last_telemetry and time.time() - _last_seen < 30:
                await ws.send_json(_last_telemetry)
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            _clients.discard(ws)

    @app.post("/api/v1/commands", status_code=202)
    async def commands(cmd: Command, request: Request):
        user = auth.session_user(request) or "dashboard"
        target, action, detail = cmd.target, cmd.action, None
        if target == "buzzer":
            sent = publish_cmd({"action": "buzzer", "state": "on", "duration_ms": cmd.ms})
        elif target == "auto":              # bouton « Buzzer sur détection »
            sent = _publish_config({"motion_buzzer": action == "on"})
        elif target == "lcd":               # texte affiché quelques secondes sur l'écran du boîtier
            detail = settings.lcd_text(cmd.text or "")
            if not detail:
                raise HTTPException(422, "Texte vide ou sans caractère affichable par l'écran")
            sent = publish_cmd({"action": "lcd", "text": detail, "duration_s": cmd.s})
        else:
            sent = False                      # LEDs : pas gérées par ce boîtier
        if sent:
            await asyncio.to_thread(db.log_command, target, action or "pulse", user, detail)
        return {"sent": sent, "target": target, "action": action, "text": detail}

    @app.patch("/api/v1/alerts/{alert_id}/ack", status_code=204)
    async def ack(alert_id: int):
        publish_cmd({"action": "ack"})        # le boîtier coupe son buzzer
        await asyncio.to_thread(db.ack_alert, alert_id)
        return Response(status_code=204)

    @app.get("/api/v1/bridge")
    async def bridge_state():
        return {
            "mqtt": {"host": MQTT_HOST, "port": MQTT_PORT, "connected": _mqtt_ok, "topic": MQTT_TOPIC},
            "device": {"online": _device_online, "topic": _device_base,
                       "last_seen_s": round(time.time() - _last_seen, 1) if _last_seen else None},
            "websockets": len(_clients),
            "database": await asyncio.to_thread(db.available),
            "last_telemetry": _last_telemetry["data"] if _last_telemetry else None,
        }

    _start_mqtt()
