# Sentinel-X : système embarqué de défense cyber-physique

Workshop 2026, M1, groupe 14 (EPSI). Un boîtier ESP8266 surveille un site isolé (température, humidité, gaz/fumée, présence), une caméra détecte les intrusions, et un serveur conteneurisé centralise les mesures, détecte les anomalies et pilote l'alarme depuis un dashboard protégé.

> La sécurité à la bordure.

## Architecture

```
Boîtier ESP8266 ── MQTTS 8883 (TLS, compte esp) ──┐
Caméra C270 → vision (YOLOv8n) ── MQTT interne ───┤
                                                   ▼
                    Mosquitto (comptes + ACL) ── API FastAPI ── PostgreSQL
                                                   │   ▲
                                 WebSocket /ws ────┘   └── anomaly (Isolation Forest)
                                                   ▼
             Navigateur ── 8080 ── Caddy (page de connexion, forward_auth) ── dashboard React
```

| Service | Rôle | Port publié |
|---|---|---|
| `mosquitto` | broker MQTT, `allow_anonymous false`, ACL par compte, TLS | 8883 |
| `api` | FastAPI : alertes, commandes, télémétrie, pont MQTT → WebSocket, connexion, conversion du gaz en ppm | `127.0.0.1:8000` |
| `postgres` | alertes, télémétrie (brut + ppm), journal des commandes | aucun |
| `dashboard` | Caddy : page `/login`, dashboard React, relais `/api`, `/ws`, `/video` | 8080 |
| `vision` | détection de personnes (YOLOv8n ONNX), flux vidéo | aucun |
| `anomaly` | moteur d'anomalies sur la télémétrie, alertes « anomalie » | aucun |

## Arborescence

| Dossier | Contenu |
|---|---|
| `app/` | API FastAPI (`main.py`, `mqtt_bridge.py`, `db.py`, `auth.py`, `mq2.py`) |
| `db/init.sql` | schéma PostgreSQL |
| `dashboard/` | dashboard React + TypeScript (Vite), page de connexion dans `public/login.html` |
| `ai/vision/` | détection d'intrusion (YOLOv8n, export ONNX) |
| `ai/anomalies/` | Isolation Forest : variables, entraînement, détection, service |
| `server/` | `docker-compose.yml`, Dockerfiles, Caddyfile, configuration Mosquitto et ACL |
| `docs/` | vault Obsidian : architecture, sécurité, décisions (ADR), journal |

## Matériel

NodeMCU ESP8266, écran LCD 16×2 I2C (D1/D2), DHT22 (D5), PIR HC-SR501 (D6), buzzer (D8), MQ-2 sur A0 via un pont 10 kΩ / 20 kΩ. Câblage détaillé : `docs/02 - Architecture/Câblage ESP8266.md`. Firmware 2.8.2 : MQTTS avec CA épinglée, secrets dans `config.h` (hors Git).

## Installation du serveur

Prérequis : Docker Engine et Docker Compose (testé sous WSL2 Ubuntu), `openssl`, `mosquitto_passwd`.

```bash
git clone https://github.com/<organisation>/Sentinel_x.git && cd Sentinel_x/server

# 1. Secrets locaux (jamais dans Git)
cp docker-compose.override.example.yml docker-compose.override.yml
#    → remplir les mots de passe MQTT, PostgreSQL, SESSION_SECRET, MQ2_R0_KOHM

# 2. Comptes MQTT
mosquitto_passwd -c mosquitto/config/passwd esp
mosquitto_passwd    mosquitto/config/passwd api
mosquitto_passwd    mosquitto/config/passwd vision

# 3. Certificats TLS (CA du groupe + certificat serveur EC P-256) dans mosquitto/config/certs/
#    voir docs/04 - Sécurité/PKI et certificats TLS.md

# 4. Mot de passe du dashboard → DASHBOARD_PASS_HASH
docker compose run --rm api python -m app.auth "mot-de-passe"

# 5. Lancement
docker compose up -d --build
docker compose ps
```

Le dashboard est sur `http://<ip-du-serveur>:8080` et redirige vers `/login`.

### Calibration du MQ-2
Capteur chaud (au moins 10 min), dans l'air propre : `GET /api/v1/mq2/calibration` (avec une session) renvoie `MQ2_R0_KOHM`. Mettre la valeur dans l'override, puis `docker compose up -d api`.

### Réentraîner le moteur d'anomalies
Avec les moyennes et écarts-types mesurés sur 15 min de fonctionnement normal :
```bash
docker compose build --build-arg GAS_PPM=4.3 --build-arg GAS_NOISE_PPM=0.6 \
  --build-arg TEMPERATURE=24.5 --build-arg HUMIDITY=46 anomaly && docker compose up -d anomaly
```

## Contrat MQTT

Préfixe `sentinel/groupe1/` :

| Topic | Émetteur | Contenu |
|---|---|---|
| `edge01/telemetry` | boîtier, toutes les 2 s | `temperature`, `humidity`, `gas_raw`, `motion`, `rssi`, `heap` |
| `edge01/alert` | boîtier | `{"type":"motion","state":"raised"}` |
| `edge01/status` | boîtier (Last Will) | `online` / `offline` |
| `edge01/cmd` | API | `{"action":"buzzer","state":"on","duration_ms":2000}` |
| `edge01/config` | API (retained) | `{"motion_buzzer":true}` |
| `cam-01/alert` | vision | alerte d'intrusion |

## API

| Route | Rôle |
|---|---|
| `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` | connexion au dashboard |
| `GET /api/v1/alerts`, `POST /api/v1/alerts`, `PATCH /api/v1/alerts/{id}/ack` | alertes |
| `POST /api/v1/commands` | buzzer et réglages du boîtier |
| `GET /api/v1/telemetry?from=&to=&dev=` | historique des mesures (gaz en ppm) |
| `GET /api/v1/mq2/calibration` | calibration du MQ-2 |
| `GET /api/v1/bridge` | état du pont MQTT, du boîtier et de la base |
| `WS /ws` | données en direct pour le dashboard |

Toutes les routes, sauf `/api/v1/auth/*`, exigent une session valide.

## Sécurité

| Mesure | Détail |
|---|---|
| MQTT chiffré | MQTTS 8883, CA du groupe épinglée dans le firmware, 1883 interne uniquement |
| MQTT authentifié | trois comptes (`esp`, `vision`, `api`), ACL par topic, anonyme refusé |
| API non exposée | liée à `127.0.0.1`, joignable seulement par Caddy |
| Dashboard | page de connexion, PBKDF2-SHA256, session HMAC `HttpOnly`/`SameSite=Strict`, blocage après 5 échecs en 5 min |
| Base | aucun port publié |
| Réseau | seuls 2222 (SSH par clé), 8080 et 8883 ouverts, limités à `192.168.137.0/24` |
| Secrets | `docker-compose.override.yml`, `passwd`, certificats et `config.h` exclus de Git |

Failles corrigées et preuves : `docs/04 - Sécurité/Failles, mesures et preuves.md`.

## Comptes de démonstration

Aucun identifiant réel n'est fourni dans ce dépôt. Pour une démo locale, créez vos propres comptes avec les commandes ci-dessus (exemple factice : `sentinel` / `demo-a-changer`).

## Équipe

Kouamé Johan Bilé, Mathis Faucher, Oussama Achahboune, Raymond Franck Tassain Djemgim, Anne Chebel. Projet encadré par M. Julien Comblez.
