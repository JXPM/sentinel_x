"""Réglages modifiables depuis l'onglet « Règles » du dashboard.

- seuils de la vision (présence prolongée, objet abandonné, confirmation, confiances) ;
- heures ouvrées : hors de ces plages, une présence est plus suspecte et passe en critique ;
- règles d'actions : quand telle alerte arrive, faire sonner le buzzer et/ou afficher un texte sur le LCD.

Stockage : table settings (une ligne par section, valeur JSON), relue au démarrage.
Sans base, les réglages vivent en mémoire jusqu'au redémarrage de l'API.
La vision reçoit ses seuils par MQTT (message retenu sur sentinel/groupe1/cam-01/config) :
un changement s'applique sans redémarrer detect.py.
"""
import datetime
import logging
import secrets
import threading
import unicodedata
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import Request
from pydantic import BaseModel, Field, field_validator, model_validator

from app import auth, db

log = logging.getLogger("uvicorn.error")

TZ = ZoneInfo("Europe/Paris")     # heures ouvrées en heure de Paris : les conteneurs sont en UTC
LCD_MAX = 32                      # écran LCD 16×2 : deux lignes de 16 caractères

# Événements qui peuvent déclencher une règle (déduits de chaque alerte par app/rules.py)
Event = Literal["danger_object", "intrusion_confirmed", "person", "loitering", "abandoned",
                "motion", "off_hours", "overheat", "gas_leak", "anomaly", "any_critical"]


def lcd_text(text: str) -> str:
    """Texte affichable par le LCD : sans accents (absents de sa police), ASCII imprimable, 32 caractères."""
    text = text.translate({0x2014: "-", 0x2013: "-", 0x2019: "'", 0xA0: " "})   # tirets, apostrophe typographique
    flat = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(c for c in flat if " " <= c <= "~").strip()[:LCD_MAX]


class VisionSettings(BaseModel):
    loiter_s: int = Field(30, ge=5, le=600)        # présence prolongée au-delà de N s
    abandon_s: int = Field(20, ge=5, le=600)       # sac seul au-delà de N s
    confirm: int = Field(3, ge=1, le=10)           # images consécutives pour confirmer
    person_conf: float = Field(0.5, ge=0.2, le=0.95)
    obj_conf: float = Field(0.35, ge=0.2, le=0.95)


class WorkHours(BaseModel):
    start: str = Field("08:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field("17:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4], max_length=7)   # 0 = lundi

    @field_validator("days")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("jours de 0 (lundi) à 6 (dimanche)")
        return sorted(set(v))

    @model_validator(mode="after")
    def _order(self):
        if self.start >= self.end:
            raise ValueError("le début des heures ouvrées doit précéder la fin")
        return self


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: "r" + secrets.token_hex(3), pattern=r"^[a-z0-9-]{1,12}$")
    name: str = Field(min_length=1, max_length=60)
    event: Event
    enabled: bool = True
    buzzer_ms: int = Field(0, ge=0, le=10_000)     # 0 = pas de buzzer
    lcd_text: str = Field("", max_length=64)       # ramené à 32 caractères ASCII par le validateur
    lcd_s: int = Field(5, ge=1, le=30)

    @field_validator("lcd_text")
    @classmethod
    def _lcd(cls, v: str) -> str:
        return lcd_text(v)


class Rules(BaseModel):
    enabled: bool = True                           # interrupteur général
    cooldown_s: int = Field(15, ge=0, le=600)      # délai minimal entre deux déclenchements d'une règle
    items: list[Rule] = Field(default_factory=list, max_length=20)


DEFAULT_RULES = [
    Rule(id="danger", name="Objet dangereux", event="danger_object", buzzer_ms=3000, lcd_text="OBJET DANGEREUX", lcd_s=10),
    Rule(id="intrusion", name="Intrusion confirmée", event="intrusion_confirmed", buzzer_ms=2000, lcd_text="INTRUSION", lcd_s=10),
    Rule(id="horaires", name="Présence hors horaires", event="off_hours", buzzer_ms=1000, lcd_text="ZONE SURVEILLEE", lcd_s=10),
    Rule(id="chaleur", name="Surchauffe (sans buzzer)", event="overheat", lcd_text="SURCHAUFFE", lcd_s=15),
]


class Settings(BaseModel):
    vision: VisionSettings = Field(default_factory=VisionSettings)
    hours: WorkHours = Field(default_factory=WorkHours)
    rules: Rules = Field(default_factory=lambda: Rules(items=[r.model_copy() for r in DEFAULT_RULES]))

    @model_validator(mode="after")
    def _unique_ids(self):
        ids = [r.id for r in self.rules.items]
        if len(ids) != len(set(ids)):
            raise ValueError("deux règles ont le même identifiant")
        return self


_lock = threading.Lock()
_current = Settings()
_meta = {"updated_at": None, "updated_by": None, "persisted": False}
_loaded = False


def load() -> bool:
    """Relit les réglages en base ; True si la base a répondu (même sans ligne)."""
    global _current, _loaded
    rows = db.load_settings()
    if rows is None:
        return False
    data, last = {}, None
    for key, value, at, by in rows:
        data[key] = value
        if last is None or at > last[0]:
            last = (at, by)
    try:
        s = Settings.model_validate(data)
    except ValueError as e:                  # ligne abîmée : on repart des valeurs par défaut
        log.warning("[réglages] valeurs en base invalides, valeurs par défaut utilisées : %s", e)
        s = Settings()
    with _lock:
        _current, _loaded = s, True
        _meta.update(updated_at=last[0].isoformat() if last else None,
                     updated_by=last[1] if last else None, persisted=True)
    return True


def loaded() -> bool:
    return _loaded


def current() -> Settings:
    if not _loaded:
        load()
    return _current


def vision_config(s: Settings | None = None) -> dict:
    """Message retenu publié pour detect.py."""
    s = s or current()
    return {**s.vision.model_dump(), "work_start": s.hours.start, "work_end": s.hours.end,
            "work_days": s.hours.days}


def off_hours(now: datetime.datetime | None = None) -> bool:
    h = current().hours
    now = now or datetime.datetime.now(TZ)
    hhmm = now.strftime("%H:%M")
    return now.weekday() not in h.days or not (h.start <= hhmm < h.end)


def _payload() -> dict:
    return {"settings": current().model_dump(), "defaults": Settings().model_dump(), **_meta}


def setup(app, publish_vision) -> None:
    """publish_vision(dict) -> bool : publie la config retenue de la vision (pont MQTT)."""

    @app.get("/api/v1/settings")
    def get_settings():
        return _payload()

    @app.put("/api/v1/settings")
    def put_settings(new: Settings, request: Request):
        global _current, _loaded
        user = auth.session_user(request) or "dashboard"
        saved = db.save_settings(new.model_dump(), user)
        with _lock:
            _current, _loaded = new, True
            _meta.update(updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                         updated_by=user, persisted=bool(saved))
        sent = publish_vision(vision_config(new))
        log.info("[réglages] modifiés par %s (base : %s, vision : %s)", user, bool(saved), sent)
        return {**_payload(), "vision_sent": sent}
