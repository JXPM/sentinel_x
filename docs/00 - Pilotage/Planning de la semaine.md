---
tags: [pilotage, planning]
---
# 📅 Planning (du 5 au 9 octobre 2026)
> [!warning] Edusign : signer dans les 15 premières minutes de chaque demi-journée.

## Lundi 5 : kick-off et architecture
- [ ] Rôles attribués ([[Équipe et rôles]])
- [ ] **Option A validée par les coachs** avec le schéma de l'[[Architecture globale]]
- [ ] Contrats JSON figés ([[Flux MQTT et topics]], [[API REST et WebSocket]])
- [ ] Dépôt structuré ([[Arborescence du dépôt]]) et `.gitignore` en place
- [ ] Pi flashé (OS Lite 64-bit), SSH par clé, Docker installé
- [ ] **MQ-2 alimenté dès maintenant** : il lui faut un long préchauffage pour se stabiliser
- [ ] CAO : relever les cotes du Pi 5 avec son ventilateur, de l'ESP, de l'OLED, du PIR, du MQ-2 et de la webcam
- [ ] CYBER : CA locale et certificats ([[PKI et certificats TLS]])

## Mardi 6 : production core
- [ ] Câblage sur breadboard ([[Câblage ESP8266]])
- [ ] **Dès le matin : test MQTTS ESP8266 → Mosquitto** (risque n°1)
- [ ] Point d'accès 192.168.10.0/24 opérationnel
- [ ] Conteneurs mosquitto, db, api, caddy démarrés
- [ ] Firmware : capteurs, OLED, publication, réception des commandes
- [ ] API : `POST /api/v1/alerts`, ingestion MQTT vers la base, WebSocket
- [ ] IA : ≥ 1 h de données « normales » enregistrées ; vision ONNX mesurée sous 100 ms sur le Pi
- [ ] Impression 3D du premier prototype de boîtier

## Mercredi 7 : intégration et vidéo
- [ ] **Matin : chaîne complète** (capteurs → courbes → alerte IA → bouton buzzer)
- [ ] Entraînement Isolation Forest et Random Forest, intégration dans le service `anomaly`
- [ ] Monitoring Grafana
- [ ] Durcissement : UFW, SSH, conteneurs non-root
- [ ] Après-midi : tournage fond vert ([[Storyboard Sentinel Drop]])
- [ ] Soir : **clone de la carte SD** et vidéo de secours de la démo

## Jeudi 8 : gel du code et pentest
- [ ] Matin : **gel du code** (tag `v1.0-freeze`), finitions du boîtier, gravure laser
- [ ] Après-midi : pentest croisé ([[Pentest du jeudi]]) et défense de notre table
- [ ] Rapport d'audit, dossier PDF, PPTX, vidéo, zip du code → **dépôt le soir**

## Vendredi 9 : soutenance
- [ ] Matin : prototype déposé au myDiL
- [ ] Répétition finale ([[Script démo live]])
- [ ] 10 min : 1 min de présentation, 1 min de vidéo, 3 min de démo, 5 min de pitch et questions
