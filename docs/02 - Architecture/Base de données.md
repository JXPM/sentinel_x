---
tags: [architecture, db]
---
# 🗄️ Base de données : PostgreSQL 16

```sql
CREATE TABLE telemetry (
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  dev         TEXT        NOT NULL,
  temperature REAL, humidity REAL, gas INTEGER, pir SMALLINT,
  rssi SMALLINT, heap INTEGER
);
CREATE INDEX ON telemetry (dev, ts DESC);

CREATE TABLE alerts (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL,
  dev TEXT, message TEXT, confidence REAL, data JSONB,
  acked_at TIMESTAMPTZ, acked_by TEXT
);
CREATE INDEX ON alerts (ts DESC);

CREATE TABLE commands (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL
);

CREATE TABLE ai_scores (
  ts TIMESTAMPTZ NOT NULL DEFAULT now(), dev TEXT,
  iforest REAL, anomaly BOOLEAN, class TEXT, proba REAL
);
```

## Volumétrie
Une mesure toutes les 2 s, soit 43 200 lignes par jour : c'est négligeable. Pas besoin de TimescaleDB.

## Rôles SQL
- `sentinel_api` : SELECT, INSERT et UPDATE sur ses tables.
- `sentinel_ai_ro` : **lecture seule** sur `telemetry`, pour l'entraînement IA.
- Aucun port publié : la base n'est joignable que sur le réseau Docker `backend`.

## Export pour l'IA
```bash
docker compose exec db psql -U sentinel_api -d sentinel \
  -c "\copy (SELECT * FROM telemetry ORDER BY ts) TO STDOUT CSV HEADER" > ai/data/telemetry.csv
```
