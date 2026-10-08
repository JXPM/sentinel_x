---
tags: [soutenance, qr]
---
# ❓ Questions probables du jury

| Question | Réponse courte | Note |
|---|---|---|
| Pourquoi l'option B ? | Pas de Pi disponible ; un laptop offre plus de CPU pour la vision, au prix d'un réseau moins isolé (NAT Windows) | [[ADR-005 Option B laptop serveur]] |
| Comment l'ESP vérifie-t-il le serveur ? | CA locale intégrée au firmware, `setTrustAnchors`, NTP local | [[PKI et certificats TLS]] |
| Pourquoi MQTTS plutôt que HTTPS ? | Une seule session TLS en RAM, bidirectionnel, LWT | [[ADR-002 MQTTS seul transport ESP]] |
| En quoi ce n'est pas un `if temp > 40` ? | Isolation Forest sur des features de tendance et de corrélation, Random Forest pour le type, hystérésis du modèle | [[IA]] |
| Comment avez-vous entraîné le modèle ? Avec quelles données ? | Normal ≥ 1 h + scénarios étiquetés, découpage temporel, métriques | [[IA]] |
| Quel taux de faux positifs ? | Valeur mesurée sur le normal mis de côté | `metrics.json` |
| Latence de la vision ? | Moyenne et p95 mesurées, résolution 320 | [[Budget RAM et performance]] |
| Vos ports sont-ils exposés hors du Wi-Fi de démo ? | Non : pare-feu Windows limité à 192.168.137.0/24, ports liés à 192.168.137.1, preuve `nmap` | [[Matrice de sécurité]] |
| Que se passe-t-il si le serveur tombe ? | `restart: unless-stopped`, l'ESP affiche « SERVER LOST » et se reconnecte, vidéo de secours | [[Risques et plans B]] |
| Qu'avez-vous subi pendant le pentest ? | Tentatives observées, ce qui a tenu, ce qu'on a corrigé | [[Pentest du jeudi]] |
| Le DHT22 ne mesure-t-il pas la chaleur du MQ-2 ? | Capteurs éloignés, aération, base « normale » enregistrée dans le boîtier | [[Boîtier et thermique]] |
| La caméra juge-t-elle les personnes ? | Non : elle décrit des faits (personne, objet dangereux, durée de présence, sac abandonné) ; un humain décide | [[IA]] |
| Les seuils sont-ils codés en dur ? | Aujourd'hui en options de `detect.py` ; évolution : onglet « Règles » modifiable sans redémarrer. Les règles décident de la réaction, jamais de la détection IA | [[Idées et évolutions]] |
| Pourquoi pas de reconnaissance faciale ? | Faisable techniquement, mais donnée biométrique (RGPD art. 9, CNIL très stricte au travail) : prévue seulement avec AIPD et consentement | [[Idées et évolutions]] |
