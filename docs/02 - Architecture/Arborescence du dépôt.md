---
tags: [architecture, git]
---
# 🗂️ Arborescence du dépôt

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
│   ├── dashboard/{package.json,src/}
│   ├── caddy/Caddyfile
│   └── monitoring/prometheus.yml
├── ai/                          # IA
│   ├── vision/{Dockerfile,requirements.txt,detect.py,models/}
│   ├── anomaly/{Dockerfile,requirements.txt,features.py,train.py,serve.py,models/}
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
