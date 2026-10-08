---
tags: [architecture, api, contrat]
---
# 🔌 API REST et WebSocket (FastAPI)

Base : `https://sentinel.lan/api/v1` (derrière Caddy). Documentation OpenAPI : `/docs`, désactivée en démo ou protégée.

## Endpoints
| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| **POST** | **`/api/v1/alerts`** | clé de service (`X-API-Key`) | **Obligatoire.** Reçoit les alertes (vision, anomaly, bridge MQTT) |
| GET | `/api/v1/alerts?limit=50&since=` | JWT | Historique |
| PATCH | `/api/v1/alerts/{id}/ack` | JWT | Acquitter une alerte |
| GET | `/api/v1/telemetry?from=&to=&dev=` | JWT | Séries pour les courbes |
| GET | `/api/v1/status` | JWT | État de l'ESP (online, RSSI, heap), des services et de l'IA |
| POST | `/api/v1/commands` | JWT | `{target, action, ms}` → publie sur `cmd` |
| POST | `/api/v1/auth/login` | — | Renvoie un JWT (comptes dans `.env`) |
| GET | `/health` | — | Liveness, utilisé par les healthchecks Docker |
| GET | `/metrics` | réseau interne | Métriques Prometheus |
| WS | `/ws?token=` | JWT | Push : `telemetry`, `alert`, `status`, `score` |

## Schéma `POST /api/v1/alerts`
```json
{
  "source": "vision | anomaly | device | fusion",
  "type": "intrusion | overheat | gas_leak | anomaly | device_offline",
  "severity": "info | warning | critical",
  "dev": "sx-001",
  "message": "Personne détectée (conf 0.87)",
  "confidence": 0.87,
  "data": {"bbox":[120,80,260,400], "latency_ms": 42}
}
```
Réponse : `201 {"id": 42, "ts": "..."}`. Validation stricte avec Pydantic (énumérations, longueurs maximales). Le champ `message` est **échappé côté dashboard** (React, pas de `dangerouslySetInnerHTML`).

## Messages WebSocket
```json
{"kind":"telemetry","data":{...}}
{"kind":"alert","data":{...}}
{"kind":"score","data":{...}}
{"kind":"status","data":{...}}
```

## Composants internes de l'API
- **Bridge MQTT** (paho, thread ou tâche asyncio) : `telemetry` → INSERT + diffusion WebSocket ; `event` motion → alerte `device` ; `status` offline → alerte `device_offline`.
- **Moteur de fusion** : intrusion `vision` et `motion` PIR à moins de 3 s d'écart → alerte `fusion` de sévérité `critical`, qui déclenche le buzzer **si le mode auto est activé** dans le dashboard.

## Service vision (hors API, `ai/vision/detect.py`)
Servi directement par le script de vision sur `:8081`, relayé par Vite en dev et par Caddy en prod (`handle /video*`).

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/video` | Flux MJPEG des trames **brutes** (15 i/s), sans dessin |
| GET | `/video/status` | État courant de la détection, en JSON |

```json
{"online": true, "camera": "c270", "ts": 1791293330.7, "width": 640, "height": 480,
 "person": true, "alarm": true, "confidence": 0.93, "bbox": [140,147,621,474],
 "confirm": 3, "confirm_needed": 3, "present_s": 12.5, "loitering": false,
 "objects": [{"label": "scissors", "confidence": 0.62, "bbox": [300,260,360,330]}], "threat": true,
 "info_objects": [{"label": "cell phone", "confidence": 0.55, "bbox": [120,300,170,360]}],
 "abandoned": false, "abandoned_s": 0.0, "infer_ms": 29.8, "total_ms": 31.4, "fps": 31.8}
```
Les alertes vision envoyées à `POST /api/v1/alerts` portent `data.reason` (`presence`, `loitering`, `danger_object`, `abandoned_object`) et `data.objects`.

## ✅ Routes réelles (8 octobre)
| Route | Rôle |
|---|---|
| `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` | connexion au dashboard (cookie de session) |
| `GET /api/v1/auth/check` · `GET /api/v1/auth/me` | vérification de session (Caddy `forward_auth`), utilisateur courant |
| `POST /api/v1/alerts` · `GET /api/v1/alerts` | alertes (PostgreSQL, repli en mémoire) |
| `PATCH /api/v1/alerts/{id}/ack` | acquittement : coupe le buzzer, renseigne `acked_at` |
| `POST /api/v1/commands` | buzzer, « buzzer sur détection » (journalisé dans `commands`) |
| `GET /api/v1/telemetry?from=&to=&dev=` | mesures d'une période, gaz en ppm (service IA) |
| `GET /api/v1/mq2/calibration` | calcule R0 du MQ-2 sur les dernières mesures |
| `GET /api/v1/bridge` | état du pont MQTT, du boîtier, de la base, nombre de WebSockets |
| `WS /ws` | télémétrie, état et alertes en direct vers le dashboard |

Toutes les routes passent par Caddy et exigent une session, sauf `/api/v1/auth/*` ([[ADR-008 Page de connexion et session]]).
