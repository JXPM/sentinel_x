---
tags: [pilotage, risques]
---
# ⚠️ Risques et plans B

| # | Risque | Proba | Impact | Prévention | Plan B |
|---|---|---|---|---|---|
| 1 | TLS trop lourd pour la RAM de l'ESP8266 | Haute | **Éliminatoire** | Test dès mardi matin ; certificats ECDSA P-256 ; une seule connexion TLS à la fois ; CPU à 160 MHz | Réduire les buffers BearSSL (MFLN) ; à défaut, documenter l'empreinte du certificat |
| 2 | Heure incorrecte sur l'ESP → certificat refusé | Moyenne | Haute | NTP servi par `chrony` sur le Pi | Pile RTC du Pi 5 ou `fake-hwclock` ; date fixe via `setX509Time` en dernier recours |
| 3 | Surchauffe du Pi dans le boîtier | Haute | Haute | Active Cooler, aérations, compartiments séparés | Inférence moins fréquente (1 trame sur 2) |
| 4 | Le DHT22 mesure la chaleur du Pi | **Haute** | Moyenne | DHT22 et MQ-2 dans un compartiment séparé, ouvert vers l'extérieur | Recalibrer la base de données « normales » une fois le Pi dans le boîtier |
| 5 | Pas d'Internet en démo | Certaine | Haute | Pas de CDN, images Docker construites à l'avance | — |
| 6 | Carte SD corrompue | Faible | **Éliminatoire** | Clone le mercredi soir | Carte clonée prête à l'emploi |
| 7 | Vision au-dessus de 100 ms | Moyenne | Moyenne | Entrée 320, ONNX Runtime, sous-échantillonnage | Entrée 256, une détection toutes les 2 trames |
| 8 | Bruit Wi-Fi en salle (2,4 GHz saturé) | Haute | Moyenne | Choisir le canal le moins chargé (1, 6 ou 11) | Rapprocher le boîtier du Pi (ils sont dans le même boîtier en option A) |
| 9 | Ports Docker qui contournent UFW | Haute | Haute (pentest) | Ports liés à `192.168.10.1` + chaîne `DOCKER-USER` | — |
| 10 | Alimentation insuffisante (Pi + webcam + ESP) | Moyenne | Haute | Alimentation officielle 27 W | Alimenter l'ESP séparément |
| 11 | Démo plantée devant le jury | — | Haute | Script répété 3 fois | Vidéo de secours de la démo enregistrée mercredi soir |
