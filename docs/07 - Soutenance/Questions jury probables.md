---
tags: [soutenance, qr]
---
# ❓ Questions probables du jury

| Question | Réponse courte | Note |
|---|---|---|
| Pourquoi l'option A ? | Produit autonome, démo indépendante d'un laptop, Linux maîtrisé | [[ADR-001 Option A Raspberry Pi 5]] |
| Comment l'ESP vérifie-t-il le serveur ? | CA locale intégrée au firmware, `setTrustAnchors`, NTP local | [[PKI et certificats TLS]] |
| Pourquoi MQTTS plutôt que HTTPS ? | Une seule session TLS en RAM, bidirectionnel, LWT | [[ADR-002 MQTTS seul transport ESP]] |
| En quoi ce n'est pas un `if temp > 40` ? | Isolation Forest sur des features de tendance et de corrélation, Random Forest pour le type, hystérésis du modèle | [[IA]] |
| Comment avez-vous entraîné le modèle ? Avec quelles données ? | Normal ≥ 1 h + scénarios étiquetés, découpage temporel, métriques | [[IA]] |
| Quel taux de faux positifs ? | Valeur mesurée sur le normal mis de côté | `metrics.json` |
| Latence de la vision ? | Moyenne et p95 mesurées, résolution 320 | [[Budget RAM et performance]] |
| Docker contourne-t-il UFW ? | Oui, d'où les ports liés à 192.168.10.1 et la chaîne `DOCKER-USER` | [[Matrice de sécurité]] |
| Que se passe-t-il si le Pi tombe ? | Redémarrage automatique, SD clonée, l'ESP affiche « SERVER LOST » | [[Risques et plans B]] |
| Qu'avez-vous subi pendant le pentest ? | Tentatives observées, ce qui a tenu, ce qu'on a corrigé | [[Pentest du jeudi]] |
| Le DHT22 ne mesure-t-il pas la chaleur du Pi ? | Compartiment séparé, base « normale » enregistrée dans le boîtier | [[Boîtier et thermique]] |
