---
tags: [architecture, mqtt, contrat]
---
# 📡 Flux MQTT et topics (contrat entre DEV, IA et INFRA)

## Topics
| Topic | Sens | QoS | Retain | Fréquence |
|---|---|---|---|---|
| `sentinel/sx-001/telemetry` | ESP → | 0 | non | toutes les 2 s |
| `sentinel/sx-001/event` | ESP → | 1 | non | sur front montant ou descendant du PIR |
| `sentinel/sx-001/status` | ESP → | 1 | **oui** | à la connexion, + LWT `offline` |
| `sentinel/sx-001/cmd` | → ESP | 1 | non | à la demande |
| `sentinel/ai/score` | anomaly → | 0 | non | toutes les 2 s |

## Payloads
**telemetry**
```json
{"ts":1791187200,"dev":"sx-001","t":23.4,"h":41.2,"gas":312,"pir":0,"rssi":-58,"heap":21400,"up":3600}
```
`gas` = valeur brute de A0 (0–1023), après le pont diviseur. `heap` = mémoire libre de l'ESP, affichée dans le dashboard (cela prouve qu'on surveille la RAM pendant le TLS).

**event**
```json
{"ts":1791187201,"dev":"sx-001","type":"motion","value":1}
```

**status** (retained), avec un LWT identique à `"state":"offline"`
```json
{"dev":"sx-001","state":"online","ip":"192.168.10.10","fw":"1.0.0"}
```

**cmd**
```json
{"target":"buzzer","action":"pulse","ms":1500}
{"target":"led_red","action":"on"}
{"target":"led_green","action":"off"}
```
`target` ∈ {`buzzer`, `led_red`, `led_green`} ; `action` ∈ {`on`, `off`, `pulse`}. L'ESP ignore toute valeur hors liste.

**ai/score**
```json
{"ts":1791187202,"dev":"sx-001","iforest":-0.12,"anomaly":false,"class":"normal","p":0.93,"eta_critical_s":null}
```

## Comptes et ACL (`mosquitto/config/acl`)
```
user esp-sx001
topic write sentinel/sx-001/telemetry
topic write sentinel/sx-001/event
topic write sentinel/sx-001/status
topic read  sentinel/sx-001/cmd

user api
topic read  sentinel/#
topic write sentinel/+/cmd

user anomaly
topic read  sentinel/+/telemetry
topic write sentinel/ai/score
```
Mots de passe : `mosquitto_passwd`, fichier gitignoré. L'ESP ne peut **ni lire les autres topics ni s'envoyer de commandes à lui-même**.

## Listeners Mosquitto
- `8883` : TLS, **seul port publié** sur l'hôte, utilisé par l'ESP.
- `1883` : **uniquement sur le réseau Docker interne**, jamais publié, authentification obligatoire. Utilisé par api et anomaly.
