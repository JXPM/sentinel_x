---
tags: [pilotage, git]
---
# 🌿 Conventions Git (notées dans le suivi individuel)

## Branches
- `main` : toujours démontrable. On n'y pousse **jamais** en direct après mardi.
- `feat/<filière>-<sujet>` : `feat/fw-mqtts`, `feat/ia-isolation-forest`, `feat/infra-ap`…
- Merge via PR, relue par une autre filière (cela compte pour la « collaboration transversale »).

## Commits sémantiques (Conventional Commits)
```
<type>(<scope>): <résumé à l'impératif>
```
Types : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `security`
Scopes : `firmware`, `api`, `dashboard`, `vision`, `anomaly`, `infra`, `mqtt`, `pki`, `docs`, `cad`

Exemples :
- `feat(firmware): publish telemetry over MQTTS every 2s`
- `feat(anomaly): train IsolationForest on rolling-window features`
- `fix(vision): resize frames to 320 to stay under 100ms`
- `security(infra): bind docker ports to AP interface only`

## Règles
- Commits petits et fréquents, un par personne et par tâche (traçabilité individuelle).
- **Aucun secret** : `.env`, `secrets.h`, `*.key`, `*.crt`, `passwd`, `*.joblib` volumineux, `data/` sont gitignorés.
- Le **tag `v1.0-freeze`** est posé jeudi matin ; le zip livré est `git archive` de ce tag.
- Vérification avant livraison : `git log -p | grep -iE "password|secret|BEGIN .*PRIVATE"` doit ne rien renvoyer.
