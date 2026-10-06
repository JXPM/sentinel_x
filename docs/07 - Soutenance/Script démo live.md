---
tags: [soutenance, démo]
---
# 🎯 Script de la démo live (3 min, à répéter 3 fois)

> [!tip] Avant de passer
> Laptop serveur sur secteur, stack lancée et ESP allumé depuis plus de 15 min (MQ-2 chaud), laptop de démo sur le Wi-Fi, dashboard ouvert, Wireshark prêt, sèche-cheveux et coton imbibé d'alcool à portée, **vidéo de secours** prête.

| Temps | Action | À l'écran | Qui |
|---|---|---|---|
| 0:00 | « Voici Sentinel-X. » Montrer l'OLED (IP, état MQTT OK) et la **LED verte** fixe | Onglet **Vue d'ensemble** : bandeau « Tout est normal », caméra en « BALAYAGE » | |
| 0:15 | Pointer les courbes en temps réel | Température, humidité, gaz et **score IA** | |
| 0:30 | **Surchauffe lente** au sèche-cheveux | La température monte, le score IA plonge, **alerte prédictive** « surchauffe estimée dans ~X min » **avant** le niveau critique | IA |
| 1:10 | **Gaz** : coton à l'alcool près du MQ-2 | Gaz qui monte, Random Forest classe `gas_leak` (ou `combined`) | IA |
| 1:40 | **Intrusion** : passer devant la caméra et le PIR | HUD caméra : « CIBLE VERROUILLÉE » + latence en ms, bandeau « INTRUSION CONFIRMÉE », alerte `fusion` **critical**, LED rouge fixe, buzzer automatique | IA/DEV |
| 1:55 | **Objet dangereux** : revenir devant la caméra avec des **ciseaux** | Cadre orange « CISEAUX », bandeau « Objet dangereux détecté » **critique**, sans attendre l'anti-rebond | IA |
| 2:10 | Onglet **Commandes** : forcer la **LED rouge / Buzzer** | Réponse physique immédiate | DEV |
| 2:25 | **Preuve TLS** : Wireshark montre `TLS Application Data` ; connexion sur 1883 refusée | Wireshark | CYBER |
| 2:45 | **Grafana** : CPU, RAM, température, conteneurs healthy | Grafana | INFRA |
| 3:00 | Fin | | |

## Plan B pendant la démo
- ESP déconnecté : bouton reset, puis LWT « offline → online » visible. On dit : « Vous voyez la résilience. »
- Vision figée : `docker compose restart vision` (environ 5 s), commenté à voix haute.
- Panne totale : lancer la vidéo de secours et expliquer l'architecture.
