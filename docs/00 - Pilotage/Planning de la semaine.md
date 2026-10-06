---
tags: [pilotage, planning]
---
# 📅 Planning (du 5 au 9 octobre 2026)
> [!warning] Edusign : signer dans les 15 premières minutes de chaque demi-journée.

## Lundi 5 : kick-off et architecture
- [ ] Rôles attribués ([[Équipe et rôles]])
- [x] ~~Option A~~ → **option B (laptop Windows serveur)**, faute de Pi ([[ADR-005 Option B laptop serveur]])
- [ ] Contrats JSON figés ([[Flux MQTT et topics]], [[API REST et WebSocket]])
- [x] `.gitignore` en place, branches par spé (`ia`, `DevAnne`…)
- [ ] Dépôt structuré ([[Arborescence du dépôt]]) : fusion des branches dans `main`
- [ ] Laptop serveur Windows : WSL2 + Docker Desktop ([[Serveur Windows (option B)]])
- [ ] **MQ-2 alimenté dès maintenant** : il lui faut un long préchauffage pour se stabiliser
- [ ] CAO : relever les cotes de l'ESP, de l'OLED, du PIR, du MQ-2, du DHT22 et de la webcam (plus de Pi)
- [ ] CYBER : CA locale et certificats ([[PKI et certificats TLS]])

## Mardi 6 : production core
- [ ] Câblage sur breadboard ([[Câblage ESP8266]])
- [ ] **Dès le matin : test MQTTS ESP8266 → Mosquitto** (risque n°1)
- [ ] Point d'accès mobile Windows 2,4 GHz (192.168.137.0/24) + pare-feu + NTP
- [ ] Jalon 1 : conteneurs mosquitto, db, api démarrés sur le laptop serveur
- [ ] Firmware : capteurs, OLED, publication, réception des commandes
- [x] API : `POST /api/v1/alerts` avec schéma validé (testé : 201 et 422)
- [ ] API : ingestion MQTT vers la base, WebSocket
- [x] IA : vision ONNX fonctionnelle (webcam laptop + USB) ; données synthétiques et notebook d'exploration (Oussama)
- [ ] IA : latence mesurée sur le laptop serveur ; ≥ 1 h de données « normales » réelles ; test vision → API
- [ ] Impression 3D du premier prototype de boîtier (**en cours**, version option B : [[Boîtier et thermique]])

## Mercredi 7 : intégration et vidéo
- [ ] **Matin : chaîne complète** (capteurs → courbes → alerte IA → bouton buzzer)
- [ ] Entraînement Isolation Forest et Random Forest, intégration dans le service `anomaly`
- [ ] Monitoring Grafana
- [ ] Durcissement : pare-feu Windows, jalon 2 (TLS, comptes MQTT), conteneurs non-root
- [ ] Après-midi : tournage fond vert ([[Storyboard Sentinel Drop]])
- [ ] Soir : sauvegarde `.env` + `pki/out/` sur clé USB (hors dépôt) et **vidéo de secours** de la démo

## Jeudi 8 : gel du code et pentest
- [ ] Matin : **gel du code** (tag `v1.0-freeze`), finitions du boîtier, gravure laser
- [ ] Après-midi : pentest croisé ([[Pentest du jeudi]]) et défense de notre table
- [ ] Rapport d'audit, dossier PDF, PPTX, vidéo, zip du code → **dépôt le soir**

## Vendredi 9 : soutenance
- [ ] Matin : prototype déposé au myDiL
- [ ] Répétition finale ([[Script démo live]])
- [ ] 10 min : 1 min de présentation, 1 min de vidéo, 3 min de démo, 5 min de pitch et questions
