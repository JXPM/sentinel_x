---
tags: [pilotage, risques]
---
# ⚠️ Risques et plans B

| # | Risque | Proba | Impact | Prévention | Plan B |
|---|---|---|---|---|---|
| 1 | TLS trop lourd pour la RAM de l'ESP8266 | Haute | **Éliminatoire** | Test dès mardi matin ; certificats ECDSA P-256 ; une seule connexion TLS à la fois ; CPU à 160 MHz | Réduire les buffers BearSSL (MFLN) ; à défaut, documenter l'empreinte du certificat |
| 2 | Heure incorrecte sur l'ESP → certificat refusé | Moyenne | Haute | NTP servi par `w32time` sur le laptop serveur | `pool.ntp.org` via le partage de connexion du point d'accès ; date fixe via `setX509Time` en dernier recours |
| 3 | Laptop serveur en veille, mise à jour Windows ou batterie vide pendant la démo | Moyenne | **Éliminatoire** | `powercfg`, Windows Update suspendu, secteur ([[Serveur Windows (option B)]]) | Second laptop préparé avec la même stack |
| 4 | Le DHT22 mesure la chaleur du MQ-2 | Moyenne | Moyenne | DHT22 éloigné du MQ-2, grilles d'aération ([[Boîtier et thermique]]) | Réenregistrer les données « normales » dans le boîtier final |
| 5 | Pas d'Internet en démo | Certaine | Haute | Pas de CDN, images Docker construites à l'avance | — |
| 6 | Point d'accès Windows indisponible (pas de connexion à partager, coupure auto) | Moyenne | **Éliminatoire** | Économie d'énergie désactivée, laptop connecté au Wi-Fi de l'école ou en Ethernet | Routeur Wi-Fi dédié |
| 7 | Vision au-dessus de 100 ms | Moyenne | Moyenne | Entrée 320, ONNX Runtime, sous-échantillonnage | Entrée 256, une détection toutes les 2 trames |
| 8 | Bruit Wi-Fi en salle (2,4 GHz saturé) | Haute | Moyenne | Point d'accès forcé en 2,4 GHz, laptop proche du boîtier | Routeur dédié sur un canal libre (1, 6 ou 11) |
| 9 | Ports Docker Desktop exposés au-delà du point d'accès | Moyenne | Haute (pentest) | Règles du pare-feu Windows limitées à 192.168.137.0/24, ports liés à `192.168.137.1` | Vérification `nmap` depuis le Wi-Fi de l'école |
| 10 | Webcam non détectée ou index différent sous Windows | Moyenne | Moyenne | Tester `--source 0/1/2` la veille | Webcam intégrée du laptop |
| 11 | Démo plantée devant le jury | — | Haute | Script répété 3 fois | Vidéo de secours de la démo enregistrée mercredi soir |
