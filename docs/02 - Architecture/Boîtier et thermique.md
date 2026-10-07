---
tags: [architecture, fablab, hardware]
---
# 📦 Boîtier et thermique (option B)

> [!important] Option B : pas de Raspberry Pi dans le boîtier
> Le serveur est un laptop Windows posé **à côté** ([[ADR-005 Option B laptop serveur]], [[Serveur Windows (option B)]]). Le boîtier ne contient que la partie capteurs et actionneurs. On n'a plus besoin de compartiment ni de ventilation pour un Pi.

> [!info] Version actuelle : boîtier v4 (2026-10-07)
> `boitier v4.f3d` (Fusion 360) et `boitier v4.stl` (17 836 triangles), encombrement **191 × 92 × 50 mm**. À ranger dans `cad/` du dépôt ([[Arborescence du dépôt]]) pour le rendu.

## Contraintes du sujet
Conception sous **Fusion360 uniquement**, **OLED visible**, passe-câbles propres, **aucun fil apparent**. Gravure laser du logo AetherCorp, des consignes de sécurité et d'un numéro de série (ex. `SX-2050-G<n>-001`).

## Contenu du boîtier
| Élément | Placement | Remarque |
|---|---|---|
| ESP8266 NodeMCU | fond du boîtier, sur entretoises | **trappe vissée** pour accéder au port micro-USB (reflash) |
| OLED SSD1306 | façade, dans une **fenêtre** ajustée à la zone visible | |
| PIR HC-SR501 | façade, **dôme qui dépasse** | rien ne doit masquer le dôme |
| DHT22 | côté **grille d'aération**, au plus loin du MQ-2 | doit mesurer l'air ambiant |
| MQ-2 | près d'une **grille vers l'extérieur** | il **chauffe** (résistance interne) : l'éloigner du DHT22 ou mettre une petite cloison entre les deux |
| LEDs 5 mm | façade, trous au diamètre exact | |
| Buzzer | contre une paroi percée de petits trous | sinon le son est étouffé |
| Webcam | **sur le dessus**, fixée (clip ou vis) | |

## Câbles qui sortent
- **Alimentation de l'ESP** (micro-USB) : vers le laptop ou un chargeur 5 V.
- **Câble USB de la webcam** : vers le laptop serveur.
- Les deux sortent **par un seul passe-câble** propre (passe-fil ou gaine), à l'arrière. Aucun fil apparent sur les faces visibles.

## Thermique
- Seule source de chaleur : le **MQ-2** (et un peu l'ESP). Grilles d'aération en bas et en haut pour que l'air circule.
- Le DHT22 doit mesurer **l'air de la pièce**, pas la chaleur du MQ-2 : c'est ce qui rend les données IA crédibles ([[IA]]).
- Matériau : **PETG** de préférence. Le PLA ramollit vers 55–60 °C, ce qui reste acceptable ici puisqu'il n'y a plus de Pi, mais le PETG est plus sûr près du MQ-2.

## Cotes à relever (sur les vrais composants, au pied à coulisse)
NodeMCU (avec ses broches), OLED (carte **et** zone visible), dôme du PIR, cylindre du MQ-2 (et sa carte), DHT22, webcam (et son pied), LEDs 5 mm, buzzer, connecteurs micro-USB et USB-A (épaisseur de la prise pour le passe-câble).
