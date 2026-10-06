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
webcam 640x480 MJPG → letterbox 320x320 → ONNX Runtime (YOLOv8n) → NMS
   ├─ passe 1, image entière : personne ≥ 0,5 · objets dangereux ≥ 0,35 · objets d'information ≥ 0,4
   ├─ passe 2, recadrage autour de la personne : objets tenus en main 2 à 3 fois plus grands
   → confirmation sur 3 trames → POST /api/v1/alerts + anti-rebond de 10 s (une aggravation part tout de suite)
   → serveur HTTP intégré :8081 → /video (MJPEG brut) et /video/status (JSON, lu 4 fois/s par le dashboard)
```

### Niveaux d'alerte de la vision
| Situation | Alerte envoyée | Bandeau du dashboard |
|---|---|---|
| Personne vue sur 3 trames | `intrusion` · warning · `reason: presence` | Présence détectée |
| Présence continue ≥ 30 s (`--loiter`) | `intrusion` · warning · `reason: loitering` | Présence prolongée |
| Sac, sac à dos ou valise **sans personne** ≥ 20 s (`--abandon`) | `anomaly` · warning · `reason: abandoned_object` | Objet abandonné |
| Personne tenant un **couteau, des ciseaux ou une batte** (3 trames) | `intrusion` · **critical** · `reason: danger_object` | Objet dangereux détecté |
| PIR + caméra à moins de 3 s (moteur de fusion de l'API) | `fusion` · critical | Intrusion confirmée |

Objets d'information (téléphone, sac à dos, sac à main, valise, ordinateur) : encadrés en gris sur la vidéo, **jamais d'alerte** à eux seuls. Un objet dangereux posé sans personne ne déclenche rien. Le dashboard affiche « objet dangereux : ciseaux 0,62 », jamais « personne suspecte » : le système décrit ce qu'il voit, il ne juge pas la personne (argument éthique et RGPD pour le jury).

### Lancer
```bash
cd ai/vision && source .venv/bin/activate
python detect.py --list-cameras             # Linux : noms des caméras
python detect.py --source c270              # Linux : caméra choisie par son nom
python detect.py --source 1                 # Windows : par numéro (pas de recherche par nom)
```
Options utiles : `--no-show` (sans fenêtre), `--debug-objects` (meilleur score couteau/ciseaux/batte chaque seconde), `--obj-conf`, `--info-conf`, `--loiter`, `--abandon`, `--no-crop-pass`, `--port` (8081 par défaut, 0 = pas de flux), `--host` (127.0.0.1 par défaut ; 0.0.0.0 seulement si Caddy dans Docker doit joindre le flux). `SENTINEL_CAMERA` remplace `--source`, `SENTINEL_API_URL` et `SENTINEL_API_KEY` activent l'envoi des alertes.

> [!warning] Numéro de caméra
> Sous Linux, `/dev/videoN` change selon l'ordre de branchement : le 2026-10-06, la C270 était `/dev/video4` et `--source 1` ne s'ouvrait pas. D'où la recherche par nom. Sous Windows, vérifier le numéro le jour de la démo.
### Étapes
> État au 2026-10-06 : branche `ia`. Option B : tourne sur le laptop serveur Windows, hors Docker ([[ADR-005 Option B laptop serveur]], section 7 de [[Serveur Windows (option B)]]).
- [x] Export ONNX : `python export_model.py` → `models/yolov8n-320.onnx` (le `.pt` et le `.onnx` ne sont pas commités, chacun les régénère)
- [x] `detect.py` : capture dans un thread (dernière trame), letterbox, inférence, NMS, classe person, confirmation sur 3 trames, anti-rebond de 10 s
- [x] Testé avec la webcam du laptop (`--source 0`) et la webcam USB Logitech C270 (`--source c270`)
- [x] Latence mesurée sur le laptop de Johan (Linux, C270) : **≈ 29 ms** d'inférence, **≈ 31 ms / 32 FPS** par trame avec la passe 1 seule ; **≈ 44 ms / 22 FPS** quand la passe 2 tourne (personne dans le champ)
- [x] Objets dangereux (couteau, ciseaux, batte) avec seconde passe sur la personne : **ciseaux détectés** au test du 2026-10-06 (sans la passe 2 : non détectés)
- [x] Présence prolongée (`--loiter`) testée ; objets d'information et objet abandonné vérifiés à l'écran du dashboard
- [ ] Tester l'objet abandonné avec un vrai sac (20 s sans personne)
- [ ] Mesure de latence par étape, avec moyenne et p95 sur 200 trames → **tableau dans le dossier**
- [x] Schéma `POST /api/v1/alerts` aligné entre `detect.py` et l'API d'Anne (testé : 201 si valide, 422 sinon)
- [ ] Test de bout en bout `detect.py` → API (après fusion de `DevAnne` et `ia` dans `main`)
- [ ] Lancer la vision sur le laptop **Windows** serveur et y mesurer la latence
- [x] Serveur MJPEG intégré à `detect.py` (bibliothèque standard, sans Flask) : trames **brutes**, le HUD et les boîtes sont dessinés par le dashboard à partir de `/video/status`
- [ ] Gestion d'erreur : webcam débranchée → alerte `device_offline` source vision, puis nouvelle tentative

### Optimisations si on dépasse 100 ms
Entrée 256 ; inférence 1 trame sur 2 ; capture dans un thread séparé (toujours traiter la **dernière** trame) ; quantification INT8 de l'ONNX (`onnxruntime.quantization`).

---
## 2. Maintenance prédictive (`ai/anomalies/`, Oussama)
> État au 2026-10-06 :
> - [x] `generate_sample_data.py` → `data/sensor_data.csv` : 1 000 mesures à 5 s, phase normale, dérive lente température + gaz (750–810), pic de gaz (900–910). `expected_scenario` sert **uniquement à l'évaluation**.
> - [x] Notebook d'exploration (`test.ipynb`, à déplacer dans `ai/anomalies/notebooks/`) : courbes, contrôle de fréquence, features delta et moyenne glissante
> - [ ] `train.py` (Isolation Forest), puis Random Forest et estimation du temps avant le niveau critique
> - [ ] Remplacer les données synthétiques par ≥ 1 h de vraies mesures de l'ESP
### Données
- **Normal** : ≥ 1 h de télémétrie réelle, **dans le boîtier final si possible** (voir [[Boîtier et thermique]]).
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
- [ ] Limites : dérive du MQ-2, taille réduite du jeu de données, chaleur du MQ-2 sur le DHT22, part de données synthétiques
