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
- [x] Dépôt structuré ([[Arborescence du dépôt]]) : fusion des branches dans `main` (`ia` et dashboard le 2026-10-06, PR #2 et #3 ; API `DevAnne-Cpp` le 2026-10-07, PR #1)
- [x] Laptop serveur : PC de Mathis, **Ubuntu sous WSL2 + Docker Engine** (fait le 2026-10-07, [[ADR-007 Serveur WSL2 et Docker Engine]], [[Serveur Windows (option B)]])
- [ ] **MQ-2 alimenté dès maintenant** : il lui faut un long préchauffage pour se stabiliser
- [ ] CAO : relever les cotes de l'ESP, de l'OLED, du PIR, du MQ-2, du DHT22 et de la webcam (plus de Pi)
- [ ] CYBER : CA locale et certificats ([[PKI et certificats TLS]])

## Mardi 6 : production core
- [ ] Câblage sur breadboard ([[Câblage ESP8266]])
- [ ] **Dès le matin : test MQTTS ESP8266 → Mosquitto** (risque n°1)
- [x] Point d'accès mobile Windows (192.168.137.0/24) + pare-feu (relais `portproxy` 8000, 1883, 8080) — **NTP pour l'ESP et bande 2,4 GHz à vérifier**
- [x] Jalon 1 : conteneurs mosquitto et api démarrés sur le serveur (2026-10-07, PR #4) ; **pas de db** (alertes en mémoire) ; dashboard servi par Caddy sur 8080 (PR #6)
- [ ] Firmware : capteurs, OLED, publication, réception des commandes
- [x] API : `POST /api/v1/alerts` avec schéma validé (testé : 201 et 422)
- [ ] API : ingestion MQTT vers la base, WebSocket
- [x] IA : vision ONNX fonctionnelle (webcam laptop + USB) ; données synthétiques et notebook d'exploration (Oussama)
- [x] Vision branchée au dashboard (flux + HUD), objets dangereux et d'information, présence prolongée, objet abandonné ; dashboard React fusionné dans `main`
- [ ] IA : latence mesurée sur le laptop serveur ; ≥ 1 h de données « normales » réelles ; test vision → API
- [ ] Impression 3D du premier prototype de boîtier (**en cours**, version option B : [[Boîtier et thermique]])

## Mercredi 7 : intégration et vidéo
- [ ] **Matin : chaîne complète** (capteurs → courbes → alerte IA → bouton buzzer) — ✅ vision → API → dashboard sur le serveur ; ❌ firmware absent du dépôt ([[2026-10-07 Mercredi]])
- [x] Idée 1 « heure inhabituelle » (8 h 30-17 h, lun-ven), PR #5 ([[Idées et évolutions]])
- [ ] Entraînement Isolation Forest et Random Forest, intégration dans le service `anomaly`
- [ ] Après-midi, **si la chaîne est complète** : idées courtes (heure inhabituelle, texte sur l'OLED, règles minimales) → [[Idées et évolutions]]
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
