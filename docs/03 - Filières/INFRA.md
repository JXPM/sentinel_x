---
tags: [filière, infra]
---
# 🖧 INFRA : Pi, réseau, Docker, monitoring

## Checklist d'installation du Pi
- [ ] Flash Raspberry Pi OS Lite 64-bit avec Pi Imager : hostname `sentinel`, utilisateur personnalisé, **clé SSH publique**, pas de mot de passe SSH
- [ ] `apt full-upgrade`, paquets de `REQUIREMENTS.md`
- [ ] Docker + compose ; `docker run hello-world`
- [ ] Point d'accès : hostapd + dnsmasq + IP statique ([[Réseau et adressage IP]])
- [ ] `sysctl net.ipv4.ip_forward=0` (persistant dans `/etc/sysctl.d/`)
- [ ] chrony en serveur NTP pour 192.168.10.0/24
- [ ] `docker compose up -d` ; `docker compose ps` affiche tous les services healthy
- [ ] Démarrage automatique au boot : services en `restart: unless-stopped`, Docker activé via systemd
- [ ] **Clone de la SD** le mercredi soir (`dd` ou Pi Imager → image `.img.xz`)

## Monitoring et MCO
- Prometheus récupère les métriques de node-exporter (CPU, RAM, disque, **température**), cAdvisor (par conteneur) et `api:8000/metrics`.
- Tableaux Grafana à préparer : *Hôte Pi*, *Conteneurs*, *Débit MQTT* (messages/s, depuis les métriques de l'API).
- Logs : rotation `json-file` (10 Mo × 3) ; `docker compose logs -f mosquitto` pour la démo.
- Dans le dossier : captures Grafana avec la stack en charge et la vision active.

## Commandes utiles
```bash
docker compose ps
docker stats --no-stream
docker compose logs -f --tail=50 api
mosquitto_sub -h 192.168.10.1 -p 8883 --cafile pki/out/ca.crt -u api -P '***' -t 'sentinel/#' -v
iw dev wlan0 station dump        # clients Wi-Fi connectés
vcgencmd measure_temp
```
