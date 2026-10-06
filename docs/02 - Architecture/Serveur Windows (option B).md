---
tags: [architecture, infra, windows]
---
# 🪟 Serveur Windows (option B)

> [!summary] En une phrase
> Un laptop **Windows 10/11** de l'équipe sert de serveur : il diffuse le Wi-Fi de démo (point d'accès mobile, **192.168.137.1**), fait tourner **Docker Desktop** (mosquitto, postgres, api…) et exécute la **vision en Python natif**, car Docker Desktop n'accède pas aux webcams USB. Voir [[ADR-005 Option B laptop serveur]].

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
