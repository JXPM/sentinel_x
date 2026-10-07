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
