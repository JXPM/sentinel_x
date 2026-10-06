---
tags: [adr]
status: accepté
date: 2026-10-06
---
# ADR-006 : dashboard en React + TypeScript (et non Vue 3)

## Contexte
Le plan initial prévoyait Vue 3 + Chart.js. La première version du dashboard (branche `dashboard`) a été écrite en React + Vite ; la version actuelle, fidèle à la maquette, a été codée sur cette base (`feat/dev-dashboard`, PR #3 mergée le 2026-10-06).

## Décision
Garder **React 19 + Vite + TypeScript**, sans bibliothèque de graphiques : courbes et jauges dessinées en SVG.

## Raisons
- Une seule base de code déjà fonctionnelle, mergée dans `main`.
- TypeScript : les types du dashboard (`src/types.ts`) reprennent le contrat de l'API, une erreur de champ se voit à la compilation.
- Moins de dépendances (pas de Chart.js) : bundle plus léger, moins de surface d'attaque, aucun CDN.

## Conséquences
- La règle « pas de `v-html` » devient « pas de `dangerouslySetInnerHTML` » : React échappe tout texte par défaut.
- Les notes qui citaient Vue ou Chart.js sont mises à jour ([[DEV]], [[Requirements complet]], [[Matrice de sécurité]]).

## Alternatives
- Réécrire en Vue 3 : aucun gain, une demi-journée perdue.
