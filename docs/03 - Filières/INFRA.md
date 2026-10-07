---
tags: [filière, infra]
---
# 🖧 INFRA : laptop serveur Windows, réseau, Docker, monitoring

> [!important] Option B
> Pas de Raspberry Pi : le serveur est un laptop Windows ([[ADR-005 Option B laptop serveur]]). Le guide complet, commandes comprises, est dans **[[Serveur Windows (option B)]]**.

> [!info] Mise en place réelle (2026-10-07)
> PC de Mathis : **Ubuntu 26.04 sous WSL2 + Docker Engine** (pas Docker Desktop), relais `netsh portproxy` vers `127.0.0.1`, webcam via **usbipd**. Mode opératoire et redémarrage : [[Serveur Windows (option B)]] section 0 ; décision : [[ADR-007 Serveur WSL2 et Docker Engine]].

## Checklist d'installation du laptop serveur
- [x] WSL2 (Ubuntu 26.04) + Docker Engine, `docker run hello-world` ; `equipe` dans les groupes `docker` et `video`
- [x] Git, clone du dépôt dans WSL (`~/sentinel_x`) ; vision en Python 3.12 via `uv`
- [x] Point d'accès mobile, IP 192.168.137.1 — [ ] **bande 2,4 GHz et économie d'énergie à vérifier**
- [x] Relais `portproxy` + règles du pare-feu Windows pour 8000, 1883, 8080 (jalon 1) — [ ] 8883, 443, 123 au jalon 2
- [ ] Service de temps Windows en serveur NTP
- [x] **Jalon 1** : `server/docker-compose.yml` avec mosquitto (1883), api (8000), dashboard Caddy (8080) ; `curl` et `mosquitto_pub` testés depuis un autre laptop — **pas de db**
- [x] Webcam C270 passée à WSL (`usbipd attach --wsl --busid 6-3`), `detect.py` dans `tmux`
- [ ] **Jalon 2** : Mosquitto TLS 8883 + comptes + ACL, Caddy 443, fermeture de 1883 et 8000
- [ ] Docker Desktop lancé à l'ouverture de session, services en `restart: unless-stopped`
- [ ] Jour J : veille désactivée, Windows Update suspendu, laptop sur secteur
- [ ] Sauvegarde : `.env` et `pki/out/` copiés sur une clé USB (**hors du dépôt**), vidéo de secours de la démo

## Monitoring et MCO
- Prometheus récupère `api:8000/metrics` ; Grafana affiche le débit MQTT et les alertes.
- node-exporter et cAdvisor sont pensés pour un hôte Linux : sous Docker Desktop, ils ne voient que la VM WSL2. Les garder optionnels, ou les remplacer par des captures du Gestionnaire des tâches et `docker stats`.
- Logs : rotation `json-file` (10 Mo × 3) ; `docker compose logs -f mosquitto` pour la démo.
- Dans le dossier : captures Grafana ou `docker stats` avec la stack en charge et la vision active.

## Commandes utiles (PowerShell, dans `server\`)
```powershell
docker compose ps
docker stats --no-stream
docker compose logs -f --tail=50 api
docker compose exec mosquitto mosquitto_sub -t "sentinel/#" -v
ipconfig                                   # IP du point d'accès : 192.168.137.1
Get-NetFirewallRule -DisplayName "Sentinel*" | Select DisplayName, Enabled
w32tm /query /status
```
