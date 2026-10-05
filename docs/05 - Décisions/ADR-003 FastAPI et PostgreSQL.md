---
tags: [adr]
status: accepté
date: 2026-10-05
---
# ADR-003 : FastAPI + PostgreSQL

## Décision
API en **Python / FastAPI**, base de données **PostgreSQL 16**.

## Raisons
- Même langage que l'IA : modèles Pydantic partagés, entraide entre filières plus facile.
- WebSocket natif, OpenAPI généré automatiquement (utile pour la documentation).
- PostgreSQL : SQL standard, JSONB pour les détails d'alerte, lecture directe par pandas pour l'entraînement. Le volume (≈ 43 000 lignes par jour) ne justifie pas une base de séries temporelles.

## Alternatives écartées
Node.js/Express (deux langages côté serveur), InfluxDB (une technologie de plus à apprendre en 4 jours).
