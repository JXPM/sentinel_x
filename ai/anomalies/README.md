# Détection d'anomalies — étape 1

Depuis la racine du projet :

```powershell
python ai/anomalies/prepare_data.py
```

Si nécessaire, installer les dépendances dans votre environnement Python :
`python -m pip install -r ai/anomalies/requirements.txt`.

Le CSV source et le notebook restent inchangés. Les résultats se trouvent dans
`data/prepared/` : données nettoyées, entraînement, évaluation et rapport qualité.
Ces fichiers conservent les métadonnées pour inspection. Pour entraîner un modèle,
sélectionner **uniquement `FEATURE_COLUMNS`** de `features.py` ; les dates,
identifiants, présence et `expected_scenario` ne sont pas des entrées du modèle.

## Validation

Dates UTC, identifiants non vides et capteurs numériques. Plages matérielles :
température -40 à 80 °C, humidité 0 à 100 %, gaz ADC 0 à 1023 (pas des ppm).
Les valeurs invalides sont rejetées et comptées ; aucune interpolation ni
suppression statistique de valeurs inhabituelles. Les doublons de mesure sont
retirés ; les doublons contradictoires sur les capteurs provoquent une erreur.
La validation ne garantit pas la calibration physique du capteur.

## Variables causales

23 variables : trois mesures instantanées ; moyenne, écart-type population et
pente de régression pour chaque capteur sur 60 et 300 secondes ; corrélation
température/gaz sur ces deux fenêtres. Pentes exprimées par seconde, calculées
avec les vrais horodatages. Corrélation nulle par convention pour un signal
constant. Chaque appareil est traité séparément. Après une interruption de plus
de 15 secondes, un nouvel historique commence. Les 300 premières secondes de
chaque segment ne produisent pas de prédiction.

En direct, valider l'historique brut puis appeler le même `build_features`.
Conserver au moins 300 secondes de données, borne initiale comprise. Ne pas
réutiliser d'anciennes variables calculées comme entrées. Si la dernière mesure
n'a pas de ligne prête, attendre ; ne pas émettre une ancienne prédiction.
Adapter la tolérance de panne à la cadence réelle via `max_gap_seconds`.

## Séparation chronologique

Pour le CSV synthétique actuel : entraînement avant 10:50 UTC, embargo de
300 secondes, évaluation à partir de 10:55 UTC. L'évaluation conserve donc le
début des deux incidents. Les fenêtres d'évaluation n'utilisent aucune mesure
de la période d'entraînement. Les mesures de l'embargo servent uniquement de
contexte historique à l'évaluation. Pas de mélange aléatoire ni de normalisation
apprise sur l'ensemble des données.

La coupure est choisie pour ce CSV, pas automatiquement pour de futures données :

```powershell
python ai/anomalies/prepare_data.py --csv chemin/mesures.csv --cutoff 2026-10-07T12:00:00Z
```

Pour Isolation Forest, confirmer que la période d'entraînement représente un
fonctionnement normal. Le contrôle des étiquettes actuel est une protection,
pas une variable du modèle. Les données restent synthétiques : cette étape
prépare l'entraînement, elle ne démontre pas encore la performance d'un modèle.

## Étape 2 — Isolation Forest

Installer les dépendances dans votre environnement puis lancer, depuis la racine :

```powershell
python -m pip install -r ai/anomalies/requirements.txt
python ai/anomalies/train.py
```

Le script recalcule les variables avec `features.py`, utilise la même séparation
chronologique et refuse une période d'entraînement étiquetée non normale.
Seules les 23 colonnes `FEATURE_COLUMNS` entrent dans le modèle. StandardScaler
est ajusté exclusivement sur l'entraînement, dans le même pipeline que le modèle.
La standardisation n'est pas indispensable aux arbres mais garde une préparation
explicite sauvegardée avec le modèle. Isolation Forest utilise 200 arbres,
random_state=42 et contamination=0.01. Cette contamination fixe le quantile de
la frontière sur l'entraînement ; elle ne garantit pas 1 % de fausses détections
sur des données inédites. Aucun paramètre n'est optimisé sur l'évaluation.

Sorties locales, ignorées par Git :
- `models/iforest.joblib` : dictionnaire avec pipeline, ordre des variables,
  fenêtres et version scikit-learn ; utiliser `bundle['model']` pour prédire.
- `reports/isolation_forest/metrics.json` : taux de faux positifs par mesure,
  précision/rappel/F1, matrice de confusion et délais par épisode.
- `reports/isolation_forest/predictions.csv` : mesures, variables, scores et verdicts.
- `reports/isolation_forest/evaluation_device_0.png` : capteurs et score brut.

`predict` renvoie -1 (anomalie) ou +1 (normal). `decision_function` est négatif
pour une anomalie et positif pour une mesure normale ; ce n'est ni une
probabilité ni un score 0–1. Les zones orange du graphique sont les scénarios
injectés ; les points rouges sont les détections. La sauvegarde est rechargée
et les prédictions et scores sont comparés exactement avant de terminer.
Ne charger que des fichiers joblib de confiance.

Le taux de faux positifs utilise toutes les lignes étiquetées normales, y compris
les retours au normal où les fenêtres contiennent encore l'incident précédent.
Les métriques concernent des prédictions brutes, sans confirmation ni cooldown.
Les épisodes sont détectés séparément par appareil ; un épisode manqué garde
un délai null. Le délai part du début de l'épisode disponible dans l'évaluation.
Pour des acquisitions dont un incident commence avant la période évaluée,
ce délai n'est pas le délai depuis le véritable début de l'incident.

Ce premier résultat sur deux épisodes synthétiques n'est pas une validation
sur le matériel réel. Ne pas ajuster les paramètres sur ces résultats puis
présenter la même période comme un test indépendant : prévoir une validation
distincte pour régler le modèle et de nouvelles sessions pour le test final.
