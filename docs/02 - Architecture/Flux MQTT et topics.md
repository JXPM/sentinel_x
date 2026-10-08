---
tags: [architecture, mqtt, contrat]
---
# 📡 Flux MQTT et topics (contrat réel, firmware 2.8.2)

> [!success] Écart du 7 octobre tranché
> Le contrat suit le format du firmware et du pont MQTT de l'API : préfixe `sentinel/groupe1/<appareil>`. L'ancien contrat `sentinel/sx-001/…` est abandonné.

## Topics
| Topic | Sens | QoS | Fréquence |
|---|---|---|---|
| `sentinel/groupe1/edge01/telemetry` | ESP → | 0 | toutes les 2 s |
| `sentinel/groupe1/edge01/alert` | ESP → | 1 | sur événement (`raised` / `cleared`) |
| `sentinel/groupe1/edge01/status` | ESP → | 1, retained | `online` à la connexion, Last Will `offline` |
| `sentinel/groupe1/edge01/cmd` | API → ESP | 1 | à la demande |
| `sentinel/groupe1/edge01/config` | API → ESP | 1, retained | réglages relus à chaque reconnexion |
| `sentinel/groupe1/cam-01/alert` | vision → | 1 | sur détection |

## Payloads
**telemetry**
```json
{"device":"edge01","fw":"2.8.2","seq":1995,"temperature":24.9,"humidity":46.1,
 "gas_raw":27,"gas_ready":true,"motion":false,"armed":true,"silenced":false,
 "alerts":{"gas":false,"temperature":false,"motion":false,"sensor_fault":false,"remote":false},
 "rssi":-42,"uptime":3991,"heap":15584}
```
Le pont de l'API ajoute `gas_ppm` (conversion du MQ-2) et relaie au dashboard par WebSocket.

**cmd** : `{"action":"buzzer","state":"on","duration_ms":2000}`, `{"action":"ack"}` (coupe le buzzer)
**config** : `{"motion_buzzer":true}` (buzzer sur détection de mouvement)

## Comptes et ACL (`server/mosquitto/config/acl`)
```
user esp
topic write sentinel/groupe1/edge01/telemetry
topic write sentinel/groupe1/edge01/alert
topic write sentinel/groupe1/edge01/status
topic read  sentinel/groupe1/edge01/cmd
topic read  sentinel/groupe1/edge01/config

user vision
topic write sentinel/groupe1/cam-01/alert
topic read  sentinel/+/+/telemetry

user api
topic read  sentinel/#
topic write sentinel/+/+/cmd
topic write sentinel/+/+/config
```
Mots de passe : `server/mosquitto/config/passwd` (`mosquitto_passwd`), hors Git. Le boîtier ne peut ni lire les autres topics, ni s'envoyer de commandes.

## Listeners
- **8883** : TLS (certificat signé par la CA du groupe), seul port MQTT publié sur le Wi-Fi.
- **1883** : interne au réseau Docker (API, vision), **non publié**.
