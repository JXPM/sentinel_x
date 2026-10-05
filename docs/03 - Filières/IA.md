---
tags: [filière, ia]
---
# 🧠 IA : vision et maintenance prédictive

> [!danger] Le piège du sujet
> **Aucun `if temp > 40`** pour décider d'une anomalie. Toute alerte environnementale doit sortir d'un **modèle entraîné**. Les seuils n'apparaissent que comme *étiquettes* pour construire le jeu de données ou comme *horizon* de prédiction, jamais comme règle de détection.

---
## 1. Vision : détection humaine (`ai/vision/`)
### Pipeline
```
webcam 640x480 MJPG → resize 320x320 → ONNX Runtime (YOLOv8n) → NMS → classe person ≥ 0,5
   → confirmation sur 3 trames → POST /api/v1/alerts (type=intrusion) + anti-rebond de 10 s
   → trame annotée → flux MJPEG :8081/video
```
### Étapes
> État au 2026-10-05 : branche `ia/vision`. Option B : tourne sur le laptop, hors Docker ([[ADR-005 Option B laptop serveur]]).
- [x] Export ONNX : `python export_model.py` → `models/yolov8n-320.onnx` (le `.pt` et le `.onnx` ne sont pas commités, chacun les régénère)
- [x] `detect.py` : capture dans un thread (dernière trame), letterbox, inférence, NMS, classe person, confirmation sur 3 trames, anti-rebond de 10 s
- [x] Testé avec la webcam du laptop (`--source 0`) et une webcam USB externe (`--source 1`)
- [ ] Noter la latence mesurée : **__ ms** d'inférence, **__ FPS** (à remplir)
- [ ] Mesure de latence par étape, avec moyenne et p95 sur 200 trames → **tableau dans le dossier**
- [ ] Brancher `SENTINEL_API_URL` / `SENTINEL_API_KEY` sur l'API du DEV dès qu'elle existe
- [ ] Serveur MJPEG Flask avec dessin des boîtes, de la confiance et des ms/FPS en surimpression
- [ ] Gestion d'erreur : webcam débranchée → alerte `device_offline` source vision, puis nouvelle tentative

### Optimisations si on dépasse 100 ms
Entrée 256 ; inférence 1 trame sur 2 ; capture dans un thread séparé (toujours traiter la **dernière** trame) ; quantification INT8 de l'ONNX (`onnxruntime.quantization`).

---
## 2. Maintenance prédictive (`ai/anomaly/`)
### Données
- **Normal** : ≥ 1 h de télémétrie mardi, **dans le boîtier final si possible** (voir [[Boîtier et thermique]]).
- **Scénarios**, enregistrés et étiquetés avec l'horodatage de début et de fin :
  | Scénario | Comment le reproduire en sécurité | Étiquette |
  |---|---|---|
  | Surchauffe lente | Sèche-cheveux à distance, chauffe progressive | `overheat` |
  | Micro-déviation de gaz | Coton imbibé d'alcool isopropylique près du MQ-2, auquel le capteur est sensible | `gas_leak` |
  | Combiné | Les deux en même temps (le cas « corrélation suspecte » du sujet) | `combined` |
  | Présence | Passer devant le PIR | (géré par la vision et la fusion) |
  > Pas de flamme, pas de gaz combustible : valider le protocole avec un coach.
- Option : enrichir avec des **données synthétiques** (tendance + bruit gaussien), à **déclarer comme telles** dans le dossier.

### Features (fenêtres glissantes de 60 s et 300 s, à 0,5 Hz)
| Feature | Pourquoi |
|---|---|
| `t_mean`, `h_mean`, `gas_mean` | niveau |
| `t_std`, `gas_std` | instabilité |
| `t_slope`, `gas_slope` (régression linéaire sur la fenêtre) | **tendance lente** → prédictif |
| `t_delta_5min`, `gas_delta_5min` | dérive |
| `corr_t_gas` (corrélation de Pearson glissante) | **corrélation suspecte** demandée par le sujet |
| `h_slope` | une hausse de température avec baisse d'humidité indique un échauffement réel |

### Modèles
1. **Isolation Forest** (non supervisé), entraîné **uniquement sur le normal** :
   `IsolationForest(n_estimators=200, contamination=0.01, random_state=42)` sur des features standardisées (`StandardScaler` dans un `Pipeline`).
   → score continu `decision_function`, courbe affichée en direct.
2. **Random Forest** (supervisé), qui classe le type d'incident : `normal`, `overheat`, `gas_leak` ou `combined`.
   `RandomForestClassifier(n_estimators=200, max_depth=10, class_weight="balanced")`.
   → donne le *type* de l'alerte et une probabilité.
3. **Estimation du temps avant le niveau critique**, qui fait le côté *prédictif* : extrapolation de la tendance (régression linéaire sur la fenêtre de 300 s) → `eta_critical_s`, affiché comme « incident estimé dans ~X min ».

### Décision d'alerte (modèle, pas seuil fixe)
Anomalie = `IsolationForest` prédit −1 sur **N fenêtres consécutives** (hystérésis contre les faux positifs). Le type et la sévérité viennent du Random Forest. Ensuite `POST /api/v1/alerts`.

### Évaluation, pour la documentation IA du dossier
- Découpage **temporel** (pas de mélange aléatoire, sinon les fenêtres qui se chevauchent créent une fuite de données).
- Isolation Forest : taux de faux positifs sur le normal mis de côté, **délai de détection** (en secondes) sur chaque scénario.
- Random Forest : matrice de confusion, précision, rappel et F1 par classe, importance des features.
- Courbe montrant que **l'alerte se déclenche avant** qu'une valeur de référence critique soit atteinte : c'est l'argument clé face au jury.

### Fichiers
`features.py` (code partagé entre l'entraînement et l'inférence), `train.py` (CSV → `models/iforest.joblib`, `rf.joblib`, `metrics.json`), `serve.py` (MQTT → features → prédiction → `ai/score` + POST).

---
## 3. Documentation IA à livrer
- [ ] Pipeline vision : modèle, résolution, latences mesurées, captures d'écran
- [ ] Jeu de données : durée, scénarios, protocole, parts réelles et synthétiques
- [ ] Features et justification
- [ ] Modèles, hyperparamètres, métriques, matrice de confusion
- [ ] Limites : dérive du MQ-2, taille réduite du jeu de données, influence de la chaleur du Pi
