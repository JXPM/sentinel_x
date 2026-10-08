---
tags: [architecture, git]
---
# 🗂️ Arborescence du dépôt

> [!info] État au 2026-10-07 (`main`)
> ```
> sentinel_x/
> ├── REQUIREMENTS.md, ARCHITECTURE.md, Journal.sh, .gitignore
> ├── .dockerignore              # exclut node_modules, .venv, dist, modèles, docs du contexte de build (PR #6)
> ├── docs/                      # ce vault Obsidian
> ├── app/main.py                # API FastAPI : GET /, POST/GET /api/v1/alerts, alertes en mémoire (PR #1)
> ├── db/init.sql                # schéma PostgreSQL, pas encore utilisé par l'API (PR #1)
> ├── server/                    # jalon 1, sans TLS (PR #4, #6)
> │   ├── docker-compose.yml     # mosquitto 1883, api 8000, dashboard 8080
> │   ├── api.Dockerfile
> │   ├── dashboard.Dockerfile   # build Vite (Node 22) puis Caddy
> │   ├── caddy/Caddyfile        # / → dashboard, /api et /ws → api, /video → detect.py (hôte :8081)
> │   └── mosquitto/config/mosquitto.conf   # anonyme, jalon 1 seulement
> ├── dashboard/                 # React + Vite + TypeScript (PR #3)
> │   ├── src/{components,data,lib,styles}/
> │   └── public/replay/sensor_data.csv   # rejeu des données IA en attendant l'ESP
> ├── ai/
> │   ├── vision/{detect.py,export_model.py,requirements*.txt,models/}   # models/ gitignoré ; heure inhabituelle (PR #5)
> │   └── anomalies/{generate_sample_data.py,data/sensor_data.csv}
> └── test.ipynb                 # notebook d'Oussama, à déplacer dans ai/anomalies/notebooks/
> ```
> Restent à créer : `firmware/`, `pki/`, `cad/` (boîtier v4 `.f3d`/`.stl`), service `db` dans le compose. L'API plus complète qui tourne sur le serveur (commandes, pont MQTT, WebSocket) **n'est pas encore dans `main`** ([[2026-10-07 Mercredi]]).

## Cible
```
sentinel_x/
├── README.md                    # vue d'ensemble, installation, démo
├── REQUIREMENTS.md              # tout ce qu'il faut installer
├── .gitignore                   # .env, secrets.h, pki/out, data/, *.key, *.crt
├── docs/                        # ← ce vault Obsidian
├── firmware/                    # DEV : PlatformIO
│   ├── platformio.ini
│   ├── include/secrets.example.h
│   └── src/main.cpp
├── server/                      # DEV + INFRA
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── mosquitto/config/{mosquitto.conf,acl}
│   ├── db/init.sql
│   ├── api/{Dockerfile,requirements.txt,app/}
│   ├── caddy/Caddyfile
│   └── monitoring/prometheus.yml
├── dashboard/                   # DEV : React + Vite + TypeScript
├── ai/                          # IA
│   ├── vision/{requirements.txt,detect.py,models/}   # Python natif, hors Docker
│   ├── anomalies/{Dockerfile,requirements.txt,features.py,train.py,serve.py,models/}
│   ├── notebooks/
│   └── data/                    # gitignoré
├── infra/                       # INFRA + CYBER (configuration de l'hôte)
│   ├── ap/{hostapd.conf,dnsmasq.conf}
│   ├── hardening/{ufw.sh,sshd_config.d/sentinel.conf,docker-user.sh}
│   └── chrony/sentinel.conf
├── pki/                         # CYBER
│   ├── gen-pki.sh
│   └── out/                     # gitignoré
└── cad/                         # Fablab : exports Fusion360 (.f3d, .stl), SVG laser
```
