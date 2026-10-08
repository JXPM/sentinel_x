# IA — Détection d’anomalies Sentinel-X

Le pipeline prépare les mesures et entraîne Isolation Forest sur le normal.
La configuration retenue utilise **une seule fenêtre de 60 secondes et 13 variables**.
Le candidat est évalué sur données synthétiques ; les vrais capteurs restent à valider.
Random Forest et le service MQTT en direct ne sont pas encore implémentés.

## Organisation

| Emplacement | Rôle |
|---|---|
| `features.py` | Validation et calculs communs à l’apprentissage et la prédiction |
| `prepare_data.py` | Préparation du CSV historique |
| `train.py` | Apprentissage et évaluation sur le CSV historique |
| `generate_sample_data.py` | Génération de sessions synthétiques reproductibles |
| `experiments/train_sessions.py` | Apprentissage et validation par sessions |
| `experiments/compare_windows.py` | Comparaison historique des fenêtres |
| `experiments/diagnose_false_positives.py` | Analyse des fausses détections |
| `tests/` | Tests automatiques du code |
| `data/`, `models/`, `reports/` | Données, modèles et résultats locaux |

Les tests du code sont différents des sessions CSV `data/sessions_v1/test/`,
réservées à l’évaluation finale du modèle.

## Installation

Depuis la racine du dépôt, sous PowerShell :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r ai/anomalies/requirements.txt
```

Créer l’environnement seulement s’il n’existe pas déjà.

## Parcours actuel : sessions séparées

### Qu’est-ce qu’une session ?

Une session est une période d’enregistrement des capteurs, conservée dans un
CSV contenant plusieurs mesures successives. Avec les vrais capteurs, ce sera
par exemple un enregistrement normal du lundi matin, un autre du lundi
après-midi ou un enregistrement avec un scénario de surchauffe le mardi.
Nos sessions actuelles simulent ces acquisitions ; elles sont synthétiques.

Plusieurs sessions permettent de couvrir les variations normales et d’évaluer
le modèle sur d’autres acquisitions que celles utilisées pour apprendre :

- `train/` : sessions normales pour apprendre le fonctionnement habituel.
- `validation/` : sessions distinctes pour mesurer les résultats et régler le modèle.
- `test/` : sessions réservées à l’évaluation finale, après fixation des choix.

Une session n’est pas une fenêtre : elle contient un enregistrement complet,
tandis que la fenêtre glissante utilise les 60 dernières secondes de cet
enregistrement à chaque mesure. Les variables sont calculées séparément pour
chaque session : le début d’une session n’utilise pas la fin de la précédente.

### Quel script appelle quel fichier ?

`features.py` contient les fonctions communes de validation, de calcul des
variables et de séparation chronologique. Ce fichier est importé par les scripts ;
il n’est pas nécessaire de le lancer directement.

`prepare_data.py` lit le CSV historique, appelle ces fonctions et exporte les
CSV nettoyé, d’entraînement et d’évaluation pour les examiner. Il n’entraîne
aucun modèle.

**`train.py` utilise directement `features.py`, mais n’appelle pas
`prepare_data.py` et ne lit pas ses CSV exportés.** Il relit le CSV source,
effectue lui-même la préparation et la séparation, puis entraîne et évalue
Isolation Forest. Lancer `prepare_data.py` avant lui est donc facultatif.

```text
CSV source → prepare_data.py → fonctions de features.py → CSV préparés
CSV source → train.py        → fonctions de features.py → modèle + résultats
```

Pour le parcours par sessions, `experiments/train_sessions.py` appelle aussi
`features.py`, mais prépare chaque session séparément. La répartition entre
train, validation et test est déjà définie par les dossiers et le manifest :
il n’utilise ni `prepare_data.py` ni sa coupure chronologique.

### Commandes

```powershell
python ai/anomalies/generate_sample_data.py
python ai/anomalies/experiments/train_sessions.py
```

Le générateur crée `data/sessions_v1/` sans modifier le CSV historique. Il refuse
un dossier existant : si les sessions sont présentes, passer à l’entraînement.
Pour une nouvelle version :

```powershell
python ai/anomalies/generate_sample_data.py --output ai/anomalies/data/sessions_v2 --seed 20261009
```

| Ensemble | Sessions | Mesures brutes | Usage |
|---|---:|---:|---|
| train | 6 | 10 800 | Normal uniquement pour apprendre |
| validation | 3 | 5 400 | Évaluation et réglages |
| test | 3 | 5 400 | Test final après fixation des choix |

Chaque session contient 1 800 mesures espacées de 5 s. Les graines, niveaux,
cycles et bruits varient. Validation et test contiennent normal, surchauffe,
gaz, incident combiné et pic de gaz, avec montée, plateau et retour progressif.
Le retour injecté reste étiqueté incident jusqu’à la fin de la perturbation.
`manifest.json` décrit graines, événements, répartition et empreintes CSV.
Toutes les sessions partagent la même famille de simulation : elles ne
remplacent pas une validation sur le matériel réel.

L’entraînement vérifie les empreintes et prépare chaque session séparément,
sans transfert d’historique entre sessions. Il lit seulement train et validation
et refuse le split test. Après les 12 mesures initiales par session, il reste
10 728 lignes d’apprentissage et 5 364 de validation.

Le pipeline StandardScaler + Isolation Forest utilise 200 arbres,
contamination=0.01 et random_state=42. Il est ajusté exclusivement sur le normal
d’apprentissage. La standardisation n’est pas indispensable aux arbres mais
est sauvegardée avec le modèle. La contamination règle la frontière sur
l’apprentissage ; elle ne garantit pas 1 % de fausses détections en validation.

### Sorties et résultats

- `models/iforest_sessions_60s.joblib` : candidat distinct du modèle historique.
- `reports/sessions_60s/validation_metrics.json` : résultats globaux et par session.
- `reports/sessions_60s/validation_predictions.csv` : scores et verdicts.
- `reports/sessions_60s/validation-XX/evaluation_device_0.png` : graphiques.

Le fichier joblib contient un dictionnaire : `bundle['model']` est le pipeline,
`bundle['feature_columns']` définit les entrées et `bundle['windows_seconds']`
vaut `(60,)`. Le rechargement des scores et verdicts est vérifié exactement.
Ne charger que des fichiers joblib de confiance.

Avec les données et paramètres par défaut : **12 épisodes détectés sur 12**,
**122 fausses détections sur 4 393 mesures normales (2,78 %)**,
**911 mesures anormales détectées sur 971 (93,82 %)**, délais de **0 à 65 s**.
Les métriques sont par mesure, sans confirmation d’alerte ni cooldown : 122
fausses détections ne signifie pas 122 alertes. La récupération reste incluse.
Un épisode manqué reçoit un délai null ; une détection à 0 s peut correspondre
à un verdict déjà anormal avant l’incident. Le retour normal exige une séquence
de verdicts normaux couvrant 60 s ; le rapport distingue début et confirmation.

Pour essayer un réglage sur validation avec des sorties séparées :

```powershell
python ai/anomalies/experiments/train_sessions.py --contamination 0.005 --model-path ai/anomalies/models/candidate_005.joblib --report-dir ai/anomalies/reports/candidate_005
```

Ajouter `--data-dir ai/anomalies/data/sessions_v2` pour une autre version.
Figer les choix sur validation avant d’évaluer le test. Le test final n’a pas
été évalué ; son script d’évaluation reste à créer. Ne pas comparer directement
ces taux à ceux de l’ancien CSV : les acquisitions et scénarios diffèrent.

## Préparation et fonctionnement futur en direct

`validate_data()` convertit les dates en UTC et vérifie les identifiants et
capteurs numériques : température -40 à 80 °C, humidité 0 à 100 %, gaz ADC
0 à 1023 (pas des ppm). Les lignes invalides sont rejetées et comptées ; les
doublons sont retirés et les mesures contradictoires au même appareil/horodatage
provoquent une erreur. Aucune interpolation ni suppression statistique des
valeurs inhabituelles. Cela ne garantit pas la calibration physique.

`build_features()` produit 13 variables : trois mesures actuelles, moyenne,
écart-type et pente sur 60 s pour chaque capteur, corrélation température/gaz.
La fenêtre `[t - 60 s, t]` inclut les bornes et ne lit pas le futur : 13 mesures
à cadence de 5 s. Les pentes sont des régressions sur les vrais horodatages,
en unités par seconde. La corrélation est nulle par convention pour un signal
constant ; positive ne signifie pas forcément hausse.

Les calculs sont séparés par appareil. Après une interruption de plus de 15 s,
l’historique recommence. Une minute est nécessaire au démarrage ; ensuite une
prédiction pourra être produite à chaque mesure. Le futur service doit conserver
60 s d’historique, borne initiale comprise, et utiliser les mêmes fonctions.
Si aucune ligne n’est prête pour la dernière mesure, attendre. Adapter la
tolérance de panne à la cadence réelle.

Seules les colonnes de `FEATURE_COLUMNS` entrent dans le modèle. Dates,
identifiants, présence, origine et étiquettes sont des métadonnées.
`predict()` renvoie -1 pour anomalie, +1 pour normal. `decision_function()` est
négatif pour une anomalie : ni une probabilité ni un score entre 0 et 1.

## CSV historique

```powershell
python ai/anomalies/prepare_data.py
python ai/anomalies/train.py
```

La préparation exporte `data/prepared/clean.csv`, `train.csv`, `evaluation.csv`
et `quality_report.json`. Le CSV nettoyé contient les mesures ; train et
évaluation contiennent aussi les variables. Pour les 1 000 mesures historiques :
588 lignes d’apprentissage, 388 d’évaluation, 12 d’historique initial et 12
d’embargo. Coupure : 5 octobre 2026 à 10:50 UTC, évaluation à 10:51 UTC.
L’embargo de 60 s évite le chevauchement des fenêtres. Adapter `--csv` et
`--cutoff` aux acquisitions ; la période d’apprentissage doit être normale.

`train.py` recalcule la préparation et écrit `models/iforest.joblib` et
`reports/isolation_forest/`. Le relancer remplace les anciens résultats à ces
emplacements. Il utilise maintenant 60 s et 13 variables. Le générateur avec
`--legacy` écrase explicitement le CSV historique ; inutile pour les sessions.

## Expériences historiques

```powershell
python ai/anomalies/experiments/compare_windows.py
python ai/anomalies/experiments/diagnose_false_positives.py
```

La comparaison conserve 60 s, 300 s et la combinaison, avec les mêmes 540
lignes d’apprentissage et 340 d’évaluation et un embargo de 300 s. Elle écrit
`reports/window_comparison/` sans remplacer le modèle. La fenêtre 300 s reste
accessible pour cette expérience explicite, pas pour le pipeline par défaut.

Le diagnostic lit les résultats de `train.py` et vérifie leur correspondance
avec le CSV. Il accepte les anciens rapports à 23 variables et les actuels
à 13 variables. Sa catégorie récupération reste fixée à 300 s pour l’analyse
historique. Les écarts aux plages d’apprentissage sont des indices descriptifs,
pas une preuve des causes du verdict. Sortie : `reports/isolation_forest/diagnostic/`.

## Tests du code

```powershell
python -m unittest discover -s ai/anomalies/tests -t ai/anomalies -v
```

`-t ai/anomalies` permet d’importer les modules. Les 7 tests couvrent le générateur,
la préparation courte, les métriques, la récupération et le refus de lire le test
final depuis l’apprentissage par sessions. Leur réussite ne prouve pas les
performances sur les vrais capteurs.

## GitHub

Conserver le code, `experiments/`, `tests/`, les dépendances et ce README.
Les sessions synthétiques, CSV préparés, modèles joblib, rapports, environnements
et dossiers temporaires sont ignorés par `.gitignore` et régénérables.
Le CSV historique reste dans le dépôt. Une règle d’ignore ne retire pas un
fichier déjà suivi par Git.

## Suite du travail

Collecter plusieurs sessions normales réelles dans le boîtier final et annoter
les incidents encadrés par l’équipe. Séparer apprentissage, validation et test
avant les réglages. Entraîner un candidat distinct sur 60 s et confirmer ce choix.
Ensuite implémenter la prédiction MQTT et la gestion des alertes, puis ajouter
Random Forest lorsque les exemples étiquetés sont suffisants.
