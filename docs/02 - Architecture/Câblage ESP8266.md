---
tags: [architecture, hardware, dev]
---
# 🔧 Câblage ESP8266 (NodeMCU v2/v3)

| Composant | Broche du composant | NodeMCU | GPIO | Remarque |
|---|---|---|---|---|
| OLED SSD1306 | SDA | D2 | 4 | I2C, adresse 0x3C, alimenté en 3,3 V |
| OLED SSD1306 | SCL | D1 | 5 | |
| DHT22 | DATA | D7 | 13 | Pull-up de 10 kΩ si module nu ; 3,3 V |
| PIR HC-SR501 | OUT | D5 | 14 | Alimenté par **VIN (5 V)** ; sortie à 3,3 V, compatible |
| MQ-2 | AO | **A0** via pont diviseur | ADC | ⚠️ AO peut monter à 5 V ; **diviseur 10 kΩ / 20 kΩ** → ≤ 3,3 V |
| MQ-2 | VCC | VIN (5 V) | | La chauffe consomme environ 150 mA |
| Buzzer actif | + | D6 | 12 | Via transistor NPN si le courant dépasse 12 mA |
| LED rouge | anode | D8 | 15 | 220 Ω vers GND (D8 doit rester bas au boot, ce qui est compatible) |
| LED verte | anode | D0 | 16 | 220 Ω vers GND |

> [!warning] Broches à éviter
> D3 (GPIO0), D4 (GPIO2) et D8 (GPIO15) déterminent le mode de démarrage. Rien qui tire D3 ou D4 vers le bas au boot.

> [!tip] MQ-2
> - Laisser chauffer **au moins quelques minutes** avant chaque mesure ; le premier préchauffage est long, on alimente le capteur dès le lundi.
> - Le capteur chauffe lui-même : l'éloigner du DHT22.

## Alimentation (option A)
Le Pi 5 alimente l'ESP par **USB** (port USB du Pi → micro-USB du NodeMCU). Un seul câble sort du boîtier : l'alimentation 27 W du Pi.

## Schéma
À réaliser sous **Fritzing** ou **Wokwi** pour le dossier PDF, et photographier la breadboard définitive.
