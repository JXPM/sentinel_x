# IA — Entraînement synthétique, détection sur les mesures réelles

## Flux retenu

```text
generate_sample_data.py → CSV synthétique normal (gaz en ppm)
                                      ↓
                       train.py → modèle Isolation Forest
                                      ↓
PostgreSQL → API → api_client.py → detect.py → scores et verdicts
```

`features.py` calcule les mêmes 13 variables sur une fenêtre de 60 secondes à
l’entraînement et à la détection. Aucune connexion directe à PostgreSQL,
aucun apprentissage automatique sur les nouvelles mesures réelles.
L’application du modèle produit des prédictions, pas une évaluation de sa
qualité : il faut des périodes normales et incidents annotés pour mesurer
les fausses détections, incidents manqués et délais.

## Fichiers

| Fichier | Rôle |
|---|---|
| `generate_sample_data.py` | Générer des mesures normales fictives au format telemetry |
| `train.py` | Entraîner sur ce CSV et sauvegarder le modèle |
| `features.py` | Contrôler le contrat et calculer les variables sur 60 s |
| `api_client.py` | Recevoir les mesures réelles via l’API |
| `detect.py` | Charger le modèle puis analyser une période ou fonctionner en continu |
| `tests/` | Vérifications automatiques avec données et API simulées |

Les anciens CSV, modèles et rapports ne sont plus les entrées du parcours actuel.

## Installation

Depuis la racine du dépôt, avec l’environnement Python activé :

```powershell
python -m pip install -r ai/anomalies/requirements.txt
```

## 1. Générer les données normales fictives

```powershell
python ai/anomalies/generate_sample_data.py
```

Sorties : `data/synthetic_normal_ppm.csv` et son fichier JSON de paramètres.
Par défaut : 10 800 mesures toutes les 2 s, soit environ 6 h. Champs compatibles
avec telemetry : `ts`, `dev`, `temperature`, `humidity`, `gas` ; métadonnées
`data_origin=synthetic`, `gas_unit=ppm`, `expected_scenario=normal`.
Les niveaux normaux d’exemple sont 24 °C, 55 % et 120 ppm. **120 ppm est une
valeur illustrative, pas une calibration ni une concentration normale garantie
pour votre gaz.** Adapter les paramètres au capteur et au gaz réellement mesuré :

```powershell
python ai/anomalies/generate_sample_data.py --gas-ppm 120 --gas-noise-ppm 2.2 --temperature 24 --humidity 55 --seed 42
```

La même graine reproduit les mêmes mesures. Le gaz est non négatif, entier
comme `telemetry.gas INTEGER`, sans plafond ADC de 1023. La commande remplace
ses sorties ; utiliser `--output` pour conserver plusieurs versions.
Les modèles entraînés sur une simulation peu représentative peuvent déclarer
anormal un fonctionnement réel normal. Les niveaux, bruit et cycles devront
être ajustés à partir d’observations du matériel, sans utiliser les incidents
comme fonctionnement normal.

## 2. Entraîner Isolation Forest

```powershell
python ai/anomalies/train.py
```

`train.py` lit le CSV synthétique, vérifie les métadonnées, appelle `features.py`,
puis ajuste StandardScaler et Isolation Forest : 200 arbres, contamination=0.01,
random_state=42. Toutes les fenêtres normales exploitables servent à apprendre ;
pas de découpage automatique train/validation/test dans ce parcours.
Les 30 premières mesures à cadence 2 s constituent la minute d’historique.
Minimum technique : 100 fenêtres exploitables, sans garantie de représentativité.

Sorties :

- `models/iforest_synthetic_ppm_60s.joblib` : nouveau modèle et configuration ppm.
- `reports/synthetic_training/training_report.json` : paramètres et provenance.

Le rechargement des scores et verdicts est vérifié exactement. Un fichier joblib
contient un dictionnaire avec `model`, `feature_columns`, `windows_seconds` et
`gas_unit`. Ne charger que des modèles de confiance. Relancer remplace ces
sorties ; utiliser `--model-path` et `--report-dir` pour conserver un candidat.
Le rapport n’annonce aucun taux de faux positifs validé sur les vrais capteurs.

## 3. Détecter sur les mesures réelles via l’API

URL : **À RENSEIGNER**. Route par défaut : `/api/v1/telemetry`.
Paramètres documentés : `from`, `to`, `dev`. Le client attend une liste JSON :

```json
[{"ts":"2026-10-08T08:00:00Z","dev":"sx-001","temperature":24.1,"humidity":55.2,"gas":120}]
```

La valeur `gas` doit déjà être convertie et calibrée en **ppm** par le backend
ou le firmware ; l’IA ne convertit pas l’ADC en ppm. Noms également acceptés :
`timestamp`, `device_id`, `t`, `h`. Dates ISO ou secondes Unix, pas millisecondes.
L’API doit renvoyer toutes les mesures de la période. Les enveloppes inconnues
et une pagination annoncée par Link sont refusées ; une limitation silencieuse
ne peut pas être détectée. Adapter le client à la pagination réelle si nécessaire.
La route est documentée mais absente de l’actuel `app/main.py` de ce dépôt :
la connexion réelle reste à vérifier avec l’équipe.

```powershell
$env:SENTINEL_API_URL = 'https://ADRESSE_A_RENSEIGNER'
```

Si nécessaire : `SENTINEL_API_TOKEN` (JWT), `SENTINEL_API_KEY`,
`SENTINEL_CA_FILE` (CA locale). Aucun secret dans Git ; vérification TLS activée.

Pour analyser une période déjà enregistrée :

```powershell
python ai/anomalies/detect.py --from 2026-10-08T08:00:00Z --to 2026-10-08T09:00:00Z --dev sx-001
```

Pour fonctionner en continu :

```powershell
python ai/anomalies/detect.py --watch --dev sx-001
```

Le modèle est chargé une seule fois. Toutes les 2 s, le script demande les
180 dernières secondes à l’API, calcule les variables et émet les nouvelles
prédictions. Au premier passage il émet uniquement la dernière prédiction par
appareil ; ensuite il évite de répéter les mêmes horodatages. Des insertions
tardives portant un horodatage plus ancien que le dernier émis sont ignorées.
La durée de récupération de 180 s est une marge ; le modèle utilise toujours
uniquement les 60 s précédant chaque mesure. Après une panne de plus de cette
marge, le script ne rejoue pas automatiquement l’historique manqué.
Arrêt : Ctrl+C. Une erreur API en mode continu est affichée puis réessayée.
Une absence de mesures ou d’historique complet donne un état d’attente, pas
un verdict normal. `--poll-seconds`, `--lookback-seconds`, `--endpoint`,
`--model` et `--output` sont configurables.

Les résultats sont affichés en JSON et écrits dans `reports/real_predictions.csv`.
Le fichier est remplacé au premier résultat d’une nouvelle exécution, puis
complété en mode continu. Pour conserver un enregistrement, choisir un autre
`--output`. Format : `ts`, `dev`, `iforest`, `anomaly`, `class`, `proba`.
`class` et `proba` restent null tant que Random Forest n’est pas implémenté.
Le script n’écrit pas dans PostgreSQL et n’envoie pas encore les scores/alertes
au backend : le contrat d’ingestion de ces sorties reste à définir avec l’équipe.

## Variables et contrôles

3 mesures actuelles + moyenne, écart-type et pente par capteur (9) + corrélation
température/gaz (1). Fenêtre `[t-60 s,t]`, bornes incluses, sans données futures.
Pentes en °C/s, %/s et ppm/s ; moyenne et écart-type du gaz en ppm.
Les appareils sont séparés ; après un trou de plus de 15 s, une nouvelle minute
est nécessaire. Les données ne sont pas nettoyées automatiquement : valeurs
manquantes/non finies, doublons et concentrations négatives sont refusés.
Les plages ADC ne sont pas appliquées. Les identifiants, dates, présence et
étiquettes ne sont pas des variables d’entrée.
`predict()` donne -1 pour anomalie, +1 pour normal ; `decision_function()` est
négatif pour anomalie, et n’est pas une probabilité ni un score 0–1.
Les anciens modèles sans métadonnée ppm sont refusés par `detect.py`.

## Tests et GitHub

```powershell
python -m unittest discover -s ai/anomalies/tests -t ai/anomalies -v
```

Ces tests vérifient le contrat, la causalité, la génération, l’entraînement et
la prédiction locale. Ils ne prouvent pas la connexion à l’API réelle ni les
performances sur le matériel. Partager code, tests, dépendances et README ;
garder CSV généré, modèles, rapports, environnements et secrets hors de Git.
Le nouveau CSV synthétique et ses paramètres sont ignorés et régénérables.
