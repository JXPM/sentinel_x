---
tags: [moc]
---
# 🛰️ Sentinel-X : QG de l'équipe G<n>

> [!info] Mission
> En 4 jours (du lundi 5 au jeudi 8 octobre 2026), livrer un **boîtier ESP8266 + capteurs** relié en **MQTTS** à un **Raspberry Pi 5** qui héberge la stack Docker, l'IA et la webcam.
> Soutenance le **vendredi 9 octobre**, finale nationale le **mardi 17 novembre** (Teams, 5 min, uniquement du live).

> [!danger] Règle éliminatoire
> Si la chaîne **ESP8266 → Pi → API → Dashboard → IA → actionneurs** ne fonctionne pas en démo le vendredi, c'est éliminatoire. Tout le reste passe après.

## Navigation
**Pilotage** : [[Équipe et rôles]] · [[Planning de la semaine]] · [[Risques et plans B]] · [[Conventions Git]] · [[Requirements et installation]]

**Sujet** : [[Sujet Sentinel-X (résumé)]] · [[Barème et notation]] · [[Livrables et checklist]]

**Architecture** : [[Architecture globale]] ⭐ · [[Réseau et adressage IP]] · [[Flux MQTT et topics]] · [[API REST et WebSocket]] · [[Base de données]] · [[Câblage ESP8266]] · [[Stack Docker Compose]] · [[Budget RAM et performance]] · [[Boîtier et thermique]] · [[Arborescence du dépôt]]

**Filières** : [[DEV]] · [[IA]] · [[INFRA]] · [[CYBER]] · [[Fablab et vidéo]]

**Sécurité** : [[Matrice de sécurité]] · [[PKI et certificats TLS]] · [[Pentest du jeudi]]

**Décisions** : [[ADR-001 Option A Raspberry Pi 5]] · [[ADR-002 MQTTS seul transport ESP]] · [[ADR-003 FastAPI et PostgreSQL]] · [[ADR-004 Vision en ONNX Runtime]] · [[ADR-005 Option B laptop serveur]]

**Soutenance** : [[Script démo live]] · [[Pitch et timing]] · [[Questions jury probables]] · [[Storyboard Sentinel Drop]]

**Journal** : [[2026-10-05 Lundi]] · [[2026-10-06 Mardi]] · [[2026-10-07 Mercredi]] · [[2026-10-08 Jeudi]] · [[2026-10-09 Vendredi]]

## 📌 Décisions figées
| Sujet | Choix |
|---|---|
| Serveur | Raspberry Pi 5 (4 Go) dans le boîtier |
| Transport ESP | MQTTS (TLS 1.2, port 8883, certificats ECDSA P-256) |
| Backend | FastAPI (Python) + PostgreSQL 16 |
| Front | Vue 3 + Vite + Chart.js (build statique, aucun CDN) |
| Vision | YOLOv8n exporté en ONNX, entrée 320×320, ONNX Runtime |
| Anomalies | Isolation Forest (non supervisé) et Random Forest (type d'incident) |
| Réseau | Point d'accès Wi-Fi du Pi, 192.168.10.0/24, sans routage vers l'extérieur |
| Proxy | Caddy en HTTPS, certificat signé par la CA locale |
| Monitoring | Prometheus, node-exporter, cAdvisor et Grafana |
