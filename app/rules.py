"""Moteur de règles : réaction automatique du boîtier aux alertes.

Les règles décident de la RÉACTION (sonner, afficher un texte), jamais de la DÉTECTION :
l'anomalie environnementale reste décidée par le modèle IA, l'intrusion par la vision et le PIR.

Appelé par POST /api/v1/alerts pour chaque alerte enregistrée (vision, fusion, boîtier, IA).
"""
import logging
import threading
import time

from app import db, settings

log = logging.getLogger("uvicorn.error")

_last_fired: dict[str, float] = {}
_lock = threading.Lock()


def events_of(alert: dict) -> set[str]:
    """Événements déclencheurs portés par une alerte."""
    data = alert.get("data") or {}
    reason = data.get("reason")
    src, typ = alert.get("source"), alert.get("type")
    ev = set()
    if reason in ("danger_object", "loitering", "abandoned", "person"):
        ev.add(reason)
    if src == "fusion":
        ev.add("intrusion_confirmed")
    if src == "device" and typ == "intrusion":
        ev.add("motion")
    if data.get("off_hours") and typ == "intrusion":
        ev.add("off_hours")
    if typ in ("overheat", "gas_leak"):
        ev.add(typ)
    if src == "anomaly":
        ev.add("anomaly")
    if alert.get("severity") == "critical":
        ev.add("any_critical")
    return ev


def on_alert(alert: dict, publish_cmd) -> list[str]:
    """Évalue les règles actives ; publish_cmd(dict) -> bool envoie une commande au boîtier.
    Renvoie les identifiants des règles déclenchées."""
    cfg = settings.current().rules
    if not cfg.enabled:
        return []
    events = events_of(alert)
    buzzer_ms, lcd, fired = 0, None, []
    now = time.time()
    with _lock:
        for r in cfg.items:
            if not r.enabled or r.event not in events:
                continue
            if now - _last_fired.get(r.id, 0) < cfg.cooldown_s:
                continue
            _last_fired[r.id] = now
            fired.append(r.id)
            buzzer_ms = max(buzzer_ms, r.buzzer_ms)      # plusieurs règles : la plus longue sonnerie
            if r.lcd_text and lcd is None:               # et le texte de la première règle de la liste
                lcd = (r.lcd_text, r.lcd_s)
    if not fired:
        return []
    who = "regle:" + ",".join(fired)
    if buzzer_ms and publish_cmd({"action": "buzzer", "state": "on", "duration_ms": buzzer_ms}):
        db.log_command("buzzer", "pulse", by=who)
    if lcd and publish_cmd({"action": "lcd", "text": lcd[0], "duration_s": lcd[1]}):
        db.log_command("lcd", "text", by=who, detail=lcd[0])
    log.info("[règles] %s déclenchée(s) par l'alerte %s/%s", ", ".join(fired), alert.get("source"), alert.get("type"))
    return fired
