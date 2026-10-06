---
tags: [filière, cyber]
---
# 🛡️ CYBER : chiffrement, durcissement, audit

## Livrables CYBER
- [ ] PKI locale et certificats ([[PKI et certificats TLS]])
- [ ] Mosquitto en TLS uniquement, sans accès anonyme, avec ACL ([[Flux MQTT et topics]])
- [ ] Durcissement de l'hôte et de Docker ([[Matrice de sécurité]])
- [ ] **Preuves** pour le jury : capture Wireshark (MQTT illisible), `testssl.sh` sur 8883 et 443, `nmap` de notre laptop serveur, score `lynis` avant et après
- [ ] Rapport d'audit du jeudi ([[Pentest du jeudi]])

## Démonstration du chiffrement (30 s en démo)
1. Wireshark sur le laptop de démo, en mode monitor ou via un port miroir ; à défaut, Wireshark directement sur le laptop serveur, sur la carte du point d'accès mobile (192.168.137.1), filtre `tcp.port == 8883`.
2. Montrer `TLSv1.2 Application Data`, sans aucune trame MQTT lisible.
3. Montrer qu'une connexion sur `1883` depuis le Wi-Fi est **refusée**, et qu'une connexion TLS sans identifiants est **rejetée**.
