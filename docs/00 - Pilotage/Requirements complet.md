# Sentinel-X : prérequis et installations (équipe G\<n\>)

> [!warning] Écrit pour l'option A (Raspberry Pi). En option B, remplacer la partie Pi par [[Serveur Windows (option B)]].

> Option A : le **Raspberry Pi 5 (4 Go)** fait office de PC Serveur Local, intégré au boîtier.
> Chaque section dit **qui** installe et **où** (Pi, laptop ou ESP8266).
> Le détail de l'architecture est dans le vault Obsidian `docs/`.

---

## 0. Matériel (à vérifier lundi matin)

- [ ] Raspberry Pi 5 4 Go + **alimentation officielle USB-C 5 V / 5 A (27 W)**
- [ ] **Active Cooler** (ventilateur du Pi 5), sinon le Pi bride ses performances pendant l'inférence YOLO
- [ ] microSD ≥ 32 Go (A2) + **une carte de secours** (clone le mercredi soir)
- [ ] Webcam USB (UVC, MJPEG 640×480)
- [ ] ESP8266 (NodeMCU v2/v3 ou Wemos D1 mini), plus un de secours si possible
- [ ] DHT22, MQ-2, PIR HC-SR501, OLED I2C SSD1306 0,96", buzzer, LEDs
- [ ] Résistances : 220 Ω (LEDs), **pont diviseur pour la sortie AO du MQ-2** (ex. 10 kΩ / 20 kΩ), car l'entrée A0 accepte 3,3 V maximum
- [ ] Breadboard, jumpers, câble micro-USB **data** (pas seulement de charge)
- [ ] Câble Ethernet (pour donner Internet au Pi pendant les installations)

## 1. Laptops de l'équipe (tout le monde)

| Outil | Usage |
|---|---|
| Git + compte GitHub (`gh` conseillé) | dépôt commun |
| VS Code + PlatformIO IDE, Python, Docker, Remote-SSH, Vue - Official | développement |
| Obsidian | ouvrir `docs/` comme vault |
| Raspberry Pi Imager | flash de la SD |
| Clé SSH `ssh-keygen -t ed25519 -C "prenom@sentinel"` | accès au Pi (par clé uniquement) |
| Node.js 20 LTS + npm | dashboard |
| Python 3.11+ | IA, scripts |
| `mosquitto-clients` | tests MQTT |
| Wireshark | preuve du chiffrement TLS en démo |
| Fusion360 (obligatoire) + Creality Print | CAO, impression K2 Plus |
| LightBurn ou Creality Falcon Studio | gravure laser Falcon A1 |
| DaVinci Resolve / CapCut / Premiere | vidéo 9:16, export MP4 H.264 |
| Teams, Edusign | finale, émargement |

## 2. Raspberry Pi 5 : système (INFRA et CYBER)

OS : **Raspberry Pi OS Lite 64-bit (Bookworm)**. Créer un utilisateur personnalisé et activer SSH par clé publique dès le flash avec Pi Imager.

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates gnupg \
  hostapd dnsmasq ufw fail2ban chrony \
  openssl mosquitto-clients v4l-utils htop jq
# hostapd/dnsmasq : point d'accès + DHCP/DNS
# ufw/fail2ban    : pare-feu + protection SSH
# chrony          : NTP local (l'ESP a besoin de l'heure pour valider le certificat TLS)

# Docker Engine + plugin compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
docker compose version
```

> ⚠️ Toutes les images doivent exister en **ARM64**. C'est le cas de toutes celles listées ci-dessous.

## 3. Images Docker (`server/docker-compose.yml`, INFRA)

| Service | Image | Rôle |
|---|---|---|
| mosquitto | `eclipse-mosquitto:2` | broker MQTT, listener TLS 8883 |
| db | `postgres:16-alpine` | télémétrie, alertes, commandes |
| api | `python:3.11-slim` (build) | FastAPI REST + WebSocket |
| dashboard | `node:20-alpine` (build) puis fichiers statiques | interface web |
| caddy | `caddy:2-alpine` | reverse proxy HTTPS |
| vision | `python:3.11-slim` (build) | YOLO sur la webcam |
| anomaly | `python:3.11-slim` (build) | Isolation Forest / Random Forest |
| prometheus | `prom/prometheus` | métriques |
| node-exporter | `prom/node-exporter` | CPU/RAM/température du Pi |
| cadvisor | `gcr.io/cadvisor/cadvisor` | métriques par conteneur |
| grafana | `grafana/grafana` | tableaux de bord monitoring |

## 4. Firmware ESP8266 : PlatformIO (DEV)

```ini
; firmware/platformio.ini
[env:nodemcuv2]
platform = espressif8266
board = nodemcuv2
framework = arduino
monitor_speed = 115200
board_build.f_cpu = 160000000L   ; 160 MHz = handshake TLS plus rapide
lib_deps =
  knolleary/PubSubClient @ ^2.8
  bblanchon/ArduinoJson @ ^7
  adafruit/DHT sensor library @ ^1.4
  adafruit/Adafruit Unified Sensor @ ^1.1
  adafruit/Adafruit SSD1306 @ ^2.5
  adafruit/Adafruit GFX Library @ ^1.11
```

Inclus dans le core (rien à installer) : `ESP8266WiFi`, `WiFiClientSecure` (BearSSL), `Wire`, NTP via `configTime()`.
Secrets : `firmware/include/secrets.h` (gitignoré), à créer en copiant `secrets.example.h`.

## 5. API : `server/api/requirements.txt` (DEV)

```
fastapi>=0.115
uvicorn[standard]>=0.30
pydantic>=2.7
pydantic-settings>=2.3
sqlalchemy>=2.0
asyncpg>=0.29
paho-mqtt>=2.1
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
prometheus-fastapi-instrumentator>=7.0
pytest>=8
httpx>=0.27
```

## 6. Dashboard : `server/dashboard` (DEV)

```bash
npm create vite@latest dashboard -- --template vue
npm i chart.js vue-chartjs chartjs-adapter-date-fns date-fns
npm i -D eslint prettier
```

> ⚠️ Tout est bundlé localement, **aucun CDN** : il n'y a pas d'Internet sur le réseau de démo.

## 7. IA vision : `ai/vision/requirements.txt` (IA, sur le Pi)

```
onnxruntime>=1.18
opencv-python-headless>=4.9
numpy>=1.26
requests>=2.32
flask>=3.0
```

Sur un **laptop uniquement**, pour exporter le modèle (inutile d'installer PyTorch sur le Pi) :

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx imgsz=320
```

## 8. IA anomalies : `ai/anomaly/requirements.txt` (IA)

```
scikit-learn>=1.5
pandas>=2.2
numpy>=1.26
joblib>=1.4
paho-mqtt>=2.1
psycopg[binary]>=3.2
requests>=2.32
```

Laptop / notebooks : `jupyterlab matplotlib seaborn`

## 9. CYBER (laptop CYBER)

`nmap`, `wireshark`, `openssl`, `testssl.sh`, `lynis` (audit du Pi), `docker-bench-security`, `metasploit-framework`.
Les outils offensifs ne s'utilisent **que le jeudi après-midi**, sur les cibles autorisées par les coachs.

## 10. Secrets (jamais dans Git)

`.env` (copie de `.env.example`), `firmware/include/secrets.h`, `pki/*.key`, `pki/*.crt`, `server/mosquitto/config/passwd`. Tous ces fichiers sont dans `.gitignore`.
