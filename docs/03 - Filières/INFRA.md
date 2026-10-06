---
tags: [filière, infra]
---
# 🖧 INFRA : laptop serveur Windows, réseau, Docker, monitoring

> [!important] Option B
> Pas de Raspberry Pi : le serveur est un laptop Windows ([[ADR-005 Option B laptop serveur]]). Le guide complet, commandes comprises, est dans **[[Serveur Windows (option B)]]**.

## Checklist d'installation du laptop serveur
- [ ] Virtualisation activée, `wsl --install`, Docker Desktop (WSL2), `docker run hello-world`
- [ ] Git, Python 3.11, clone du dépôt
- [ ] Point d'accès mobile `SENTINEL-X-G<n>` en **2,4 GHz**, économie d'énergie désactivée, IP 192.168.137.1 vérifiée avec `ipconfig`
- [ ] Règles du pare-feu Windows (8883, 443, 123 ; 1883 et 8000 pour le jalon 1 seulement)
- [ ] Service de temps Windows en serveur NTP
- [ ] **Jalon 1** : `server/docker-compose.yml` avec mosquitto (1883), db, api (8000) ; tests `curl` et `mosquitto_pub` depuis un autre laptop
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
