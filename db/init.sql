-- Schéma Sentinel-X (PostgreSQL 16)
-- Exécuté une seule fois par l'image postgres, au premier démarrage du volume :
--   ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
-- Toutes les dates sont en TIMESTAMPTZ (stockées en UTC).

-- Mesures de l'ESP8266, une ligne toutes les 2 s (topic sentinel/<dev>/telemetry)
CREATE TABLE IF NOT EXISTS telemetry (
    id          BIGSERIAL    PRIMARY KEY,
    ts          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    dev         VARCHAR(32)  NOT NULL,
    temperature REAL,
    humidity    REAL,
    gas         INTEGER,      -- lecture brute du MQ-2 (0-1023)
    gas_ppm     REAL,         -- estimation en ppm (app/mq2.py), NULL tant que le capteur n'est pas calibré
    presence    BOOLEAN,
    rssi        SMALLINT,
    heap        INTEGER
);
CREATE INDEX IF NOT EXISTS telemetry_dev_ts ON telemetry (dev, ts DESC);

-- Alertes reçues par POST /api/v1/alerts (mêmes énumérations que le modèle Pydantic)
CREATE TABLE IF NOT EXISTS alerts (
    id         BIGSERIAL     PRIMARY KEY,
    ts         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    source     VARCHAR(20)   NOT NULL CHECK (source   IN ('vision', 'anomaly', 'device', 'fusion')),
    type       VARCHAR(30)   NOT NULL CHECK (type     IN ('intrusion', 'overheat', 'gas_leak', 'anomaly', 'device_offline')),
    severity   VARCHAR(10)   NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    dev        VARCHAR(32)   NOT NULL,
    message    VARCHAR(200)  NOT NULL,
    confidence REAL          CHECK (confidence BETWEEN 0 AND 1),
    data       JSONB         NOT NULL DEFAULT '{}'::jsonb,
    acked_at   TIMESTAMPTZ,
    acked_by   VARCHAR(32)
);
CREATE INDEX IF NOT EXISTS alerts_ts ON alerts (ts DESC);
-- Accélère le badge « alertes à traiter » du dashboard
CREATE INDEX IF NOT EXISTS alerts_unacked ON alerts (ts DESC) WHERE acked_at IS NULL;

-- Journal des commandes envoyées depuis le dashboard (traçabilité)
CREATE TABLE IF NOT EXISTS commands (
    id       BIGSERIAL    PRIMARY KEY,
    ts       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    username VARCHAR(32)  NOT NULL,
    target   VARCHAR(20)  NOT NULL CHECK (target IN ('buzzer', 'led_red', 'led_green', 'auto')),
    action   VARCHAR(20)  NOT NULL CHECK (action IN ('on', 'off', 'auto', 'pulse'))
);
CREATE INDEX IF NOT EXISTS commands_ts ON commands (ts DESC);

-- Sorties du service anomalies (courbe du score d'anomalie)
CREATE TABLE IF NOT EXISTS ai_scores (
    id      BIGSERIAL    PRIMARY KEY,
    ts      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    dev     VARCHAR(32)  NOT NULL,
    iforest REAL,                 -- score brut Isolation Forest
    anomaly BOOLEAN,              -- verdict Isolation Forest
    class   VARCHAR(20),          -- classe Random Forest : normal, overheat, gas_leak, combined
    proba   REAL CHECK (proba BETWEEN 0 AND 1)
);
CREATE INDEX IF NOT EXISTS ai_scores_dev_ts ON ai_scores (dev, ts DESC);
