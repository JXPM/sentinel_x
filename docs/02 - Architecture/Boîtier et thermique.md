---
tags: [architecture, fablab, hardware]
---
# 📦 Boîtier et thermique

## Contraintes du sujet
Conception sous **Fusion360 uniquement**, **OLED visible**, passe-câbles propres, **aucun fil apparent**. Gravure laser du logo AetherCorp, des consignes de sécurité et d'un numéro de série (ex. `SX-2050-G<n>-001`).

## Deux compartiments séparés par une cloison
| Compartiment | Contenu | Aération |
|---|---|---|
| **Capteurs** (avant) | ESP8266, DHT22, MQ-2, PIR (lentille en façade), OLED (fenêtre) | Grille vers l'**extérieur**, pour mesurer l'air ambiant et non la chaleur du Pi |
| **Calcul** (arrière) | Pi 5 + Active Cooler | Entrée d'air basse, sortie haute, à plus de 1 cm du ventilateur |

- La webcam est fixée **sur le dessus** du boîtier et branchée en interne sur le Pi.
- Sortent uniquement : l'alimentation USB-C et, éventuellement, le câble Ethernet (à masquer).
- Laisser un accès à la microSD et au port USB de l'ESP (reflash) par une trappe vissée.
- Matériau : **PETG** ou ABS plutôt que PLA, qui ramollit vers 55–60 °C, près du Pi et du MQ-2.

## Cotes à relever lundi
Pi 5 + Active Cooler, NodeMCU, OLED (zone active), dôme du PIR, MQ-2 (cylindre), webcam, LEDs 5 mm, buzzer.
