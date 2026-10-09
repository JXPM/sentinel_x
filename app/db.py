"""Accès PostgreSQL de l'API (schéma : db/init.sql).

Une seule connexion partagée, protégée par un verrou, rouverte si elle tombe.
Sans DATABASE_URL, ou si la base est injoignable, chaque fonction renvoie None
et l'API garde son fonctionnement en mémoire : la démo marche dans tous les cas.
"""
import logging
import os
import threading
import time

try:
    import psycopg
    from psycopg.types.json import Json
except ImportError:          # image sans pilote : mode mémoire
    psycopg = None
    Json = dict

log = logging.getLogger("uvicorn.error")

DATABASE_URL = os.getenv("DATABASE_URL", "")
RETRY_S = 10                  # délai minimal entre deux tentatives de reconnexion

_conn = None
_lock = threading.Lock()
_last_try = 0.0


# Base créée avec une version antérieure de init.sql : on la met à niveau sans recréer le volume
_MIGRATIONS = (
    "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS gas_ppm REAL",
    "CREATE TABLE IF NOT EXISTS settings (key VARCHAR(20) PRIMARY KEY, value JSONB NOT NULL,"
    " updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by VARCHAR(32) NOT NULL)",
    "ALTER TABLE commands ADD COLUMN IF NOT EXISTS detail VARCHAR(64)",
    "ALTER TABLE commands ALTER COLUMN username TYPE VARCHAR(64)",
    "ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_target_check",
    "ALTER TABLE commands ADD CONSTRAINT commands_target_check"
    " CHECK (target IN ('buzzer', 'led_red', 'led_green', 'auto', 'lcd'))",
    "ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_action_check",
    "ALTER TABLE commands ADD CONSTRAINT commands_action_check"
    " CHECK (action IN ('on', 'off', 'auto', 'pulse', 'text'))",
)


def _connection():
    """Connexion ouverte, ou None si la base est indisponible (sans bloquer plus de 3 s)."""
    global _conn, _last_try
    if not (DATABASE_URL and psycopg):
        return None
    if _conn is not None and not _conn.closed:
        return _conn
    if time.time() - _last_try < RETRY_S:
        return None
    _last_try = time.time()
    try:
        _conn = psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=3)
        for sql in _MIGRATIONS:
            try:
                _conn.execute(sql)
            except psycopg.Error as e:       # une migration ratée ne doit pas couper la base
                log.warning("[db] migration ignorée (%s) : %s", sql[:60], e)
        log.info("[db] connecté à PostgreSQL")
    except Exception as e:
        _conn = None
        log.warning("[db] PostgreSQL injoignable, alertes gardées en mémoire : %s", e)
    return _conn


def _run(sql: str, params: tuple = (), fetch: str | None = None):
    """Exécute une requête ; renvoie None si la base est indisponible."""
    global _conn
    with _lock:
        conn = _connection()
        if conn is None:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if fetch == "one":
                    return cur.fetchone()
                if fetch == "all":
                    return cur.fetchall()
                return True
        except psycopg.OperationalError as e:
            log.warning("[db] connexion perdue : %s", e)
            _conn = None
            return None
        except Exception as e:
            log.warning("[db] requête refusée : %s", e)
            return None


def available() -> bool:
    return _run("SELECT 1", fetch="one") is not None


def insert_alert(a: dict) -> dict | None:
    row = _run(
        "INSERT INTO alerts (source, type, severity, dev, message, confidence, data)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, ts",
        (a["source"], a["type"], a["severity"], a["dev"], a["message"], a.get("confidence"), Json(a.get("data") or {})),
        fetch="one",
    )
    return {"id": row[0], "ts": row[1].isoformat()} if row else None


def list_alerts(limit: int) -> list[dict] | None:
    rows = _run(
        "SELECT id, ts, source, type, severity, dev, message, confidence, data, acked_at, acked_by"
        " FROM alerts ORDER BY ts DESC, id DESC LIMIT %s",
        (limit,), fetch="all",
    )
    if rows is None:
        return None
    keys = ("id", "ts", "source", "type", "severity", "dev", "message", "confidence", "data", "acked_at", "acked_by")
    out = []
    for r in reversed(rows):              # même ordre que la version en mémoire : du plus ancien au plus récent
        d = dict(zip(keys, r))
        d["ts"] = d["ts"].isoformat()
        d["acked_at"] = d["acked_at"].isoformat() if d["acked_at"] else None
        out.append(d)
    return out


def ack_alert(alert_id: int, by: str = "dashboard") -> bool:
    return bool(_run("UPDATE alerts SET acked_at = now(), acked_by = %s WHERE id = %s AND acked_at IS NULL", (by, alert_id)))


def insert_telemetry(dev: str, d: dict) -> None:
    gas = d.get("gas_raw", d.get("gas"))
    presence = d.get("presence", d.get("motion"))
    _run(
        "INSERT INTO telemetry (dev, temperature, humidity, gas, gas_ppm, presence, rssi, heap)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (str(dev)[:32], d.get("temperature"), d.get("humidity"),
         int(gas) if gas is not None else None, d.get("gas_ppm"),
         bool(presence) if presence is not None else None,
         d.get("rssi"), d.get("heap")),
    )


def telemetry_range(start, end, dev: str | None) -> list[dict] | None:
    """Mesures d'une période, gaz en ppm (contrat de ai/anomalies/api_client.py)."""
    sql = ("SELECT ts, dev, temperature, humidity, gas_ppm FROM telemetry"
           " WHERE ts >= %s AND ts <= %s AND gas_ppm IS NOT NULL AND temperature IS NOT NULL AND humidity IS NOT NULL")
    params = [start, end]
    if dev:
        sql += " AND dev = %s"
        params.append(dev)
    rows = _run(sql + " ORDER BY ts", tuple(params), fetch="all")
    if rows is None:
        return None
    return [{"ts": r[0].isoformat(), "dev": r[1], "temperature": r[2], "humidity": r[3], "gas": r[4]} for r in rows]


def recent_gas_raw(dev: str | None, seconds: int = 120) -> list[int] | None:
    sql = "SELECT gas FROM telemetry WHERE ts > now() - make_interval(secs => %s) AND gas IS NOT NULL"
    params = [seconds]
    if dev:
        sql += " AND dev = %s"
        params.append(dev)
    rows = _run(sql, tuple(params), fetch="all")
    return None if rows is None else [r[0] for r in rows]


_CMD_TARGETS = {"buzzer", "led_red", "led_green", "auto", "lcd"}
_CMD_ACTIONS = {"on", "off", "auto", "pulse", "text"}


def log_command(target: str, action: str, by: str = "dashboard", detail: str | None = None) -> None:
    """Traçabilité des commandes envoyées au boîtier, depuis le dashboard ou par une règle (table commands)."""
    if target in _CMD_TARGETS and action in _CMD_ACTIONS:
        _run("INSERT INTO commands (username, target, action, detail) VALUES (%s, %s, %s, %s)",
             (by[:64], target, action, detail[:64] if detail else None))


def load_settings() -> list[tuple] | None:
    """Lignes (clé, valeur, date, auteur) de la table settings ; None si la base est indisponible."""
    return _run("SELECT key, value, updated_at, updated_by FROM settings", fetch="all")


def save_settings(sections: dict, by: str) -> bool:
    """Enregistre chaque section (vision, hours, rules) ; False si la base est indisponible."""
    ok = True
    for key, value in sections.items():
        ok = bool(_run(
            "INSERT INTO settings (key, value, updated_by) VALUES (%s, %s, %s)"
            " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by",
            (key, Json(value), by[:32]),
        )) and ok
    return ok
