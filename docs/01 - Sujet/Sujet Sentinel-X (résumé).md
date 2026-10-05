---
tags: [sujet]
source: "~/Workshop-2026_BAC+4_Sujet_Sentinel-X.pdf.pdf"
---
# 📄 Sujet : Mission Sentinel-X (résumé fidèle)

## Contexte
En 2050, **AetherCorp Industrial Solutions** exploite des micro-centrales isolées, exposées à trois menaces : **cyberattaques**, **intrusions physiques** (espionnage) et **risques environnementaux** (fuite de gaz, surchauffe). Il faut un boîtier autonome (**Edge Node**) relié sans fil et de façon sécurisée à un **PC Serveur Local** durci.

## Quatre piliers
1. **Edge et IoT** : un microcontrôleur ESP8266 pour la captation et les alertes physiques.
2. **IA locale** : vision temps réel et détection prédictive sur séries temporelles.
3. **Infra** : conteneurs résilients, ingestion sécurisée.
4. **Cyber** : chiffrement, durcissement, pentest croisé.

## Exigences par filière
### DEV
- Firmware **C++** (Arduino IDE ou PlatformIO) : lecture cadencée des capteurs, OLED, payloads.
- API REST et/ou WebSocket (Node.js, Python ou Go), **`POST /api/v1/alerts` obligatoire**.
- Dashboard (React, Vue ou JS) : courbes en temps réel, statut, **webcam**.
- Panneau de commande pour déclencher **buzzer et LEDs à distance**.

### IA
- Script Python sur le serveur : webcam USB → modèle (ex. YOLOv8-tiny) → **présence humaine**.
- **Maintenance prédictive** sur les séries temporelles. ❌ **Interdit : `if temp > 40`**. Il faut un vrai modèle (Isolation Forest, Random Forest…).
- Exemple attendu : *une hausse lente de température corrélée à une micro-déviation de gaz, détectée avant le seuil critique.*
- Images redimensionnées (ex. 640×480) pour rester **sous 100 ms par trame**.

### INFRA
- Docker Compose : **base de données, API, Mosquitto**.
- Point d'accès Wi-Fi dédié, plan d'adressage, **sous-réseau étanche** (ex. 192.168.10.0/24).
- Monitoring et MCO : CPU, RAM, volumes de logs MQTT.

### CYBER
- **TLS obligatoire** entre l'ESP8266 et la stack (MQTTS ou HTTPS).
- Durcissement : UFW/iptables, **SSH par clés uniquement**, privilèges Docker restreints.
- Jeudi : pentest croisé (Nmap, Wireshark, Metasploit).

## Matériel
ESP8266 (1 ou 2), webcam USB, DHT22, MQ-2, PIR HC-SR501, OLED I2C 0,96", buzzers, LEDs, breadboards. Fablab : Creality K2 Plus (3D) et Falcon A1 (laser).

## Option A, retenue : voir [[ADR-001 Option A Raspberry Pi 5]]
Le Pi 5 (4 Go) est **fixé dans le boîtier**, exécute Docker Compose et l'IA vision ; la webcam est branchée dessus et l'ESP8266 s'y connecte en Wi-Fi.

## Fablab
- Coque conçue **uniquement sous Fusion360**, OLED visible, passe-câbles propres, **aucun fil apparent**.
- Gravure laser : logo AetherCorp, consignes de sécurité, **numéro de série**.
- Vidéo : voir [[Storyboard Sentinel Drop]].

## Voir aussi
[[Barème et notation]] · [[Livrables et checklist]] · [[Planning de la semaine]]
