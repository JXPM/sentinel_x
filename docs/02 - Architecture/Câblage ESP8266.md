---
tags: [architecture, hardware, dev]
---
# 🔧 Câblage ESP8266 (NodeMCU, firmware 2.8.2)

> [!info] Source
> Câblage réel du firmware `SentinelX.ino` v2.8.2 (constantes `PIN_*`), documenté par Mathis dans *Configuration de l'ESP — Sentinel-X* (branche `MathisTest`). Il remplace le plan initial (OLED, LED), qui n'a pas été retenu.

| Composant | Signal → broche | GPIO | Alimentation | Remarque |
|---|---|---|---|---|
| Écran LCD 16×2 (module I2C) | SDA → D2, SCL → D1 | 4, 5 | 5 V | adresse I2C détectée automatiquement (0x27 ou 0x3F) |
| DHT22 (température, humidité) | OUT → D5 | 14 | 3,3 V | alerte « capteur absent » après 3 lectures ratées |
| PIR HC-SR501 (présence) | OUT → D6 | 12 | 5 V | stabilisation 60 s après la mise sous tension |
| Buzzer (passif) | S → D8 | 15 | 3,3 V | piloté par le firmware ; D8 reste bas au démarrage |
| MQ-2 (fumée, gaz) | A0 → pont 10 kΩ / 20 kΩ → A0 | ADC | 5 V | chauffe 60 s avant d'exploiter la mesure |
| — | D0, D3, D4, D7 | | | libres |

Aucune LED d'état sur le boîtier : l'état (Wi-Fi, broker, alerte) s'affiche sur l'écran LCD.

> [!warning] Broches à éviter
> D3 (GPIO0), D4 (GPIO2) et D8 (GPIO15) fixent le mode de démarrage : rien ne doit tirer D3 ou D4 vers le bas au boot. Le buzzer sur D8 est compatible (D8 reste bas).

## Alimentation
Par **USB** (micro-USB) ou power bank. L'alimentation de breadboard MB102 est trop faible pour les pics de courant du Wi-Fi et la chauffe du MQ-2.

## MQ-2 et ppm
Le firmware envoie la lecture brute `gas_raw` (0–1023) et `gas_ready` (capteur chaud). Le seuil local du boîtier est `GAS_ALERT_RAW = 600` (retour à la normale sous 500). La conversion en **ppm** est faite par le serveur ([[ADR-009 Gaz en ppm calibré côté serveur]]) : R0 = **5,157 kΩ**, environ 4 ppm dans l'air propre.

## Bibliothèques
PubSubClient (MQTT), LiquidCrystal_I2C (LCD), DHT sensor library. Téléversement à 115200 bauds.
