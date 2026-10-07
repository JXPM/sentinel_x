---
tags: [architecture, infra, windows]
---
# 🪟 Serveur Windows (option B)

> [!summary] En une phrase
> Le **PC Windows de Mathis** sert de serveur : il diffuse le Wi-Fi de démo (point d'accès mobile, **192.168.137.1**) et héberge **Ubuntu sous WSL2**, où tournent Docker Engine (mosquitto, api, dashboard) **et** la vision. Voir [[ADR-005 Option B laptop serveur]] et [[ADR-007 Serveur WSL2 et Docker Engine]].

## 0. Ce qui tourne réellement (mis en place le 2026-10-07)
> [!important] Les sections 1 à 8 décrivent le plan initial (Docker Desktop, vision sous Windows). La mise en place réelle est celle-ci ; elles restent valables pour le point d'accès, le NTP et le jour de la démo.

```
 Ton laptop 192.168.137.20 ──Wi-Fi──► PC Windows de Mathis 192.168.137.1
                                        │  netsh portproxy → 127.0.0.1 (+ pare-feu 192.168.137.0/24)
                                        │    2222 SSH · 8000 API · 1883 MQTT · 8080 dashboard
                                        ▼
                                      Ubuntu 26.04 sous WSL2 (172.31.x.x, invisible du Wi-Fi)
                                        ├─ Docker Engine : mosquitto :1883, api :8000, dashboard (Caddy) :8080
                                        └─ tmux « vision » : detect.py :8081 (C270 via usbipd)
```

| Adresse (depuis le Wi-Fi) | Service |
|---|---|
| `http://192.168.137.1:8080` | **dashboard** (Caddy : `/` → build React, `/api` et `/ws` → api, `/video` → detect.py) |
| `http://192.168.137.1:8000` | API FastAPI en direct (jalon 1, à fermer au jalon 2) |
| `192.168.137.1:1883` | Mosquitto, anonyme et en clair (jalon 1, à remplacer par 8883 TLS) |
| `ssh -p 2222 equipe@192.168.137.1` | administration de WSL (compte `equipe`, groupes `sudo`, `docker`, `video`) |

### Relais Windows (PowerShell administrateur, une fois)
```powershell
netsh interface portproxy add v4tov4 listenaddress=192.168.137.1 listenport=8000 connectaddress=127.0.0.1 connectport=8000
netsh interface portproxy add v4tov4 listenaddress=192.168.137.1 listenport=1883 connectaddress=127.0.0.1 connectport=1883
netsh interface portproxy add v4tov4 listenaddress=192.168.137.1 listenport=8080 connectaddress=127.0.0.1 connectport=8080
New-NetFirewallRule -DisplayName "Sentinel TEST API 8000"       -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress 192.168.137.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Sentinel TEST MQTT 1883"      -Direction Inbound -Protocol TCP -LocalPort 1883 -RemoteAddress 192.168.137.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Sentinel TEST Dashboard 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -RemoteAddress 192.168.137.0/24 -Action Allow
netsh interface portproxy show all      # vérification
```
Le port 8081 (flux vidéo) **n'est pas relayé** : seul Caddy, dans WSL, le joint.

### Après chaque redémarrage du PC
1. Point d'accès mobile allumé (2,4 GHz).
2. Webcam vers WSL (PowerShell administrateur) — **6-3 = Logi C270**, pas 4-1 (webcam intégrée) :
   ```powershell
   & "C:\Program Files\usbipd-win\usbipd.exe" attach --wsl --busid 6-3
   ```
3. Dans WSL (`ssh -p 2222 equipe@192.168.137.1`) :
   ```bash
   cd ~/sentinel_x && git pull
   cd server && docker compose up -d --build && docker compose ps
   tmux new -d -s vision "cd ~/sentinel_x/ai/vision && SENTINEL_API_URL=http://localhost:8000 .venv/bin/python detect.py --source c270 --no-show --host 0.0.0.0 2>&1 | tee vision.log"
   ```
4. Vérifier depuis un autre appareil : `http://192.168.137.1:8080` (caméra en direct, alertes).

### Vision dans WSL (installation, une fois)
```bash
sudo usermod -aG docker,video equipe                 # puis se reconnecter
sudo apt install -y libgl1 libglib2.0-0t64 tmux usbutils
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env
cd ~/sentinel_x/ai/vision
uv venv -p 3.12 .venv                                # Python 3.12 : celui d'Ubuntu 26.04 est trop récent pour numpy < 2.3
uv pip install -p .venv -r requirements.txt "opencv-python<5"
# modèle (gitignoré), depuis un laptop qui l'a :
#   scp -P 2222 ai/vision/models/yolov8n-320.onnx equipe@192.168.137.1:~/sentinel_x/ai/vision/models/
.venv/bin/python detect.py --list-cameras            # /dev/video0  Logi C270 HD WebCam
```

### Pièges rencontrés
- `permission denied … docker.sock` : `equipe` pas dans le groupe `docker`, ou session ouverte avant le `usermod` → se reconnecter.
- `curl` qui tourne sans fin depuis le Wi-Fi : port non relayé par `portproxy` ou bloqué par le pare-feu Windows.
- Caméra « online » mais aucune image (`/video/status` sans `fps`) : **OpenCV 5.0** → revenir à `opencv-python<5`.
- Copier-coller dans le SSH : les blocs `<<'EOF'` cassent si des espaces précèdent `EOF` ; passer par Git (fichiers écrits sur un laptop, `git pull` sur le serveur).
- `git push` depuis le serveur : pas de mot de passe GitHub (token obligatoire). Pousser depuis un laptop (`git fetch ssh://equipe@192.168.137.1:2222/home/equipe/sentinel_x <branche>:<branche>`), ne pas stocker de token sur le compte partagé.

```
 ESP8266 ──Wi-Fi 2,4 GHz──► [Laptop Windows = serveur]  192.168.137.1
                              ├─ Point d'accès mobile Windows (DHCP 192.168.137.0/24)
                              ├─ Docker Desktop (WSL2) : mosquitto :8883, db, api :8000, caddy :443
                              ├─ Python natif : ai/vision/detect.py  (webcam USB)
                              └─ Service de temps Windows : NTP pour l'ESP
 Laptop de démo / dashboard ──Wi-Fi──► https://192.168.137.1
```

## 1. Prérequis (une fois, en administrateur)
- [ ] Virtualisation activée dans le BIOS (le Gestionnaire des tâches affiche « Virtualisation : Activé » dans l'onglet Performances > Processeur)
- [ ] PowerShell **administrateur** : `wsl --install`, puis redémarrer
- [ ] Installer **Docker Desktop** (moteur WSL2), cocher *Start Docker Desktop when you sign in*
- [ ] Vérifier : `docker run hello-world` et `docker compose version`
- [ ] Installer **Git for Windows** et **Python 3.11** (cocher *Add to PATH*)
- [ ] `git clone https://github.com/JXPM/sentinel_x.git`

Limiter la RAM de WSL2 si le laptop n'a que 8 Go : fichier `%UserProfile%\.wslconfig`
```ini
[wsl2]
memory=4GB
```
puis `wsl --shutdown` et relancer Docker Desktop.

## 2. Wi-Fi de démo : point d'accès mobile Windows
Paramètres → Réseau et Internet → **Point d'accès sans fil mobile** :
- [ ] Nom : `SENTINEL-X-G<n>`, mot de passe long (≥ 20 caractères, rangé dans le `.env`, **jamais dans Git**)
- [ ] **Bande : 2,4 GHz** (l'ESP8266 ne voit pas le 5 GHz)
- [ ] **Économie d'énergie : désactivée**, sinon Windows coupe le point d'accès quand aucun appareil n'est connecté
- [ ] Activer, puis vérifier dans PowerShell : `ipconfig` → une carte « Connexion au réseau local* » en **192.168.137.1**

> [!warning] Limites du point d'accès Windows
> - Il faut que le laptop ait une connexion à partager (Wi-Fi de l'école ou Ethernet), sinon Windows grise le bouton.
> - Il partage cette connexion (NAT) : le sous-réseau n'est **pas étanche** comme en option A. À documenter dans la [[Matrice de sécurité]].
> - Maximum 8 appareils, pas de réservation DHCP : l'IP de l'ESP peut changer. Ce n'est pas grave, c'est l'ESP qui se connecte au serveur, jamais l'inverse.
> - **Plan B** : un petit routeur Wi-Fi dédié (sans câble Internet). Plus fiable, réservation DHCP possible, vrai réseau isolé.

## 3. Pare-feu Windows (PowerShell administrateur)
On n'ouvre que ce qui sert, et **seulement pour le sous-réseau du point d'accès** :
```powershell
New-NetFirewallRule -DisplayName "Sentinel MQTTS"  -Direction Inbound -Protocol TCP -LocalPort 8883 -RemoteAddress 192.168.137.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Sentinel HTTPS"  -Direction Inbound -Protocol TCP -LocalPort 443  -RemoteAddress 192.168.137.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Sentinel NTP"    -Direction Inbound -Protocol UDP -LocalPort 123  -RemoteAddress 192.168.137.0/24 -Action Allow
# Jalon 1 uniquement (tests sans TLS), à supprimer ensuite :
New-NetFirewallRule -DisplayName "Sentinel TEST MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -RemoteAddress 192.168.137.0/24 -Action Allow
New-NetFirewallRule -DisplayName "Sentinel TEST API 8000"  -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress 192.168.137.0/24 -Action Allow
```
Supprimer une règle : `Remove-NetFirewallRule -DisplayName "Sentinel TEST MQTT 1883"`.

> [!danger] À vérifier par la CYBER
> Au premier lancement, Docker Desktop peut demander d'autoriser son « Backend » sur tous les réseaux : répondre **réseaux privés uniquement**. Puis prouver avec `nmap` depuis un laptop **hors** du point d'accès (Wi-Fi de l'école) que 1883, 8000, 8883 et 443 ne répondent pas. Si ça répond, lier les ports à l'IP du point d'accès dans le compose (`"192.168.137.1:8883:8883"`, point d'accès allumé **avant** `docker compose up`).

## 4. Heure pour l'ESP (NTP), indispensable au TLS
L'ESP doit connaître l'heure pour valider le certificat. Le laptop la lui sert (PowerShell administrateur) :
```powershell
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer" -Name Enabled -Value 1
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Config" -Name AnnounceFlags -Value 5
Set-Service w32time -StartupType Automatic
Restart-Service w32time
w32tm /query /configuration    # NtpServer doit être "Enabled: 1"
```
Côté firmware : `configTime(0, 0, "192.168.137.1");`

## 5. Démarrer la stack (jalon 1 : sans TLS, pour tester la chaîne)
Les fichiers sont à créer par l'INFRA dans `server/` (voir [[Stack Docker Compose]] pour la version complète et durcie).

`server/mosquitto/config/mosquitto.conf` (**jalon 1 seulement**, anonyme et en clair) :
```
listener 1883 0.0.0.0
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
```

`server/api.Dockerfile` :
```dockerfile
FROM python:3.11-slim
WORKDIR /srv
RUN pip install --no-cache-dir fastapi "uvicorn[standard]"
COPY app ./app
USER 10001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`server/docker-compose.yml` :
```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    restart: unless-stopped
    ports: ["1883:1883"]
    volumes:
      - ./mosquitto/config:/mosquitto/config:ro
      - mosq-data:/mosquitto/data

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    volumes: [pg-data:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"], interval: 10s }

  api:
    build: { context: .., dockerfile: server/api.Dockerfile }
    restart: unless-stopped
    env_file: .env
    ports: ["8000:8000"]
    depends_on: { db: { condition: service_healthy } }

volumes: { mosq-data: {}, pg-data: {} }
```
Lancer (PowerShell, dans `sentinel_x\server`) :
```powershell
copy .env.example .env      # puis remplir les vraies valeurs
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

### Tests depuis un autre laptop connecté au point d'accès
```bash
curl http://192.168.137.1:8000/                       # {"message":"Sentinel-X API fonctionne"}
mosquitto_pub -h 192.168.137.1 -t test -m hello       # et sur le serveur :
# docker compose exec mosquitto mosquitto_sub -t '#' -v
```

## 6. Jalon 2 : sécurisation (avant jeudi)
- [ ] Mosquitto en **TLS sur 8883**, `allow_anonymous false`, fichier `passwd` et ACL ([[PKI et certificats TLS]], [[Flux MQTT et topics]])
- [ ] Certificat serveur avec `subjectAltName=IP:192.168.137.1`
- [ ] Caddy en HTTPS sur 443 devant l'API et le dashboard ; retirer les ports 1883 et 8000 du compose et leurs règles de pare-feu
- [ ] Clé API sur `POST /api/v1/alerts`
- [ ] `nmap` de preuve pour le dossier

## 7. La vision tourne hors Docker
PowerShell, dans `sentinel_x\ai\vision` :
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned    # une fois, pour autoriser Activate.ps1
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-export.txt
python export_model.py
$env:SENTINEL_API_URL = "http://localhost:8000"
python detect.py --source 1 --host 0.0.0.0
```
- Sous Windows, la caméra se choisit **par numéro** (la recherche par nom `--source c270` ne marche que sous Linux). Si la webcam met longtemps à s'ouvrir ou n'est pas trouvée, essayer `--source 0`, `1`, `2`.
- `--host 0.0.0.0` : nécessaire ici, car Caddy tourne dans Docker Desktop et joint le flux via `host.docker.internal:8081`. En contrepartie, **bloquer le port 8081 depuis le Wi-Fi** dans le pare-feu Windows (seul Caddy doit l'atteindre). À vérifier avec `nmap` ([[Matrice de sécurité]]).
- Options de détection (présence prolongée, objets, etc.) : voir [[IA]].
- L'heure du laptop doit être juste (synchronisation NTP active) : la future règle « heure inhabituelle » en dépend ([[Idées et évolutions]]).

## 8. Le jour de la démo
```powershell
powercfg /change standby-timeout-ac 0        # jamais de mise en veille sur secteur
powercfg /change monitor-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # capot fermé = ne rien faire
powercfg /setactive SCHEME_CURRENT
```
- [ ] **Suspendre Windows Update** (Paramètres → Windows Update → Suspendre)
- [ ] Laptop **sur secteur**, notifications coupées (mode Ne pas déranger)
- [ ] Ordre de démarrage : point d'accès → Docker Desktop → `docker compose up -d` → `detect.py` → ESP sous tension
