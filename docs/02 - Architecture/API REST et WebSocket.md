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
Réponse : `201 {"id": 42, "ts": "..."}`. Validation stricte avec Pydantic (énumérations, longueurs maximales). Le champ `message` est **échappé côté dashboard** (pas de `v-html`).

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
