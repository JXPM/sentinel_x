---
tags: [architecture, git]
---
# 🗂️ Arborescence du dépôt

> [!info] État au 2026-10-06 (`main`)
> ```
> sentinel_x/
> ├── REQUIREMENTS.md, Journal.sh, .gitignore
> ├── docs/                      # ce vault Obsidian
> ├── dashboard/                 # React + Vite + TypeScript (PR #3)
> │   ├── src/{components,data,lib,styles}/
> │   └── public/replay/sensor_data.csv   # rejeu des données IA en attendant l'ESP
> ├── ai/
> │   ├── vision/{detect.py,export_model.py,requirements*.txt,models/}   # models/ gitignoré
> │   └── anomalies/{generate_sample_data.py,data/sensor_data.csv}
> └── test.ipynb                 # notebook d'Oussama, à déplacer dans ai/anomalies/notebooks/
> ```
> Pas encore dans `main` : l'API (`app/main.py`) et le schéma (`db/init.sql`) sur `DevAnne-Cpp`. Le firmware, `server/`, `pki/` et `infra/` restent à créer.

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
