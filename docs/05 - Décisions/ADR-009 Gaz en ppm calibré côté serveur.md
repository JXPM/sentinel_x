---
tags: [adr, ia, hardware]
status: accepté
date: 2026-10-08
---
# ADR-009 : gaz converti en ppm côté serveur, MQ-2 calibré

## Contexte
Le firmware envoie la lecture brute du MQ-2 (`gas_raw`, 0–1023). Le modèle d'anomalies de l'équipe IA attend du **ppm**.

## Décision
- Conversion dans l'API (`app/mq2.py`) : lecture → tension sur A0 → tension du capteur (pont 10 kΩ / 20 kΩ) → Rs (RL = 1 kΩ) → Rs/R0 → ppm, courbe GPL de la fiche technique.
- R0 mesuré dans l'air propre, capteur chaud, via `GET /api/v1/mq2/calibration` : **5,157 kΩ** (≈ 4 ppm au repos), mis dans `MQ2_R0_KOHM`.
- La base stocke `gas` (brut) et `gas_ppm` ; le dashboard affiche « ppm » dès que la valeur est calibrée, sinon « indice ».

## Conséquences
- Pas de changement de firmware ; recalibrer si le capteur est changé.
- Valeur d'**équivalent GPL** : à présenter comme une estimation, pas une mesure certifiée.
- Ce n'est pas du CO₂ : quelques ppm dans l'air propre, pas 400.
