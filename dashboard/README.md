# Dashboard Sentinel-X

Interface de supervision de la micro-centrale (React 19 + Vite + TypeScript).

## Lancer un test complet avec la webcam USB

Trois terminaux, depuis la racine du dépôt :

```bash
# 1. Vision : la caméra est choisie par son nom, pas par son numéro (/dev/videoN change
#    selon l'ordre de branchement). « --list-cameras » affiche les noms disponibles.
cd ai/vision && source .venv/bin/activate
python detect.py --source c270 --no-show          # flux sur http://localhost:8081/video

# 2. API (facultatif pour la caméra, nécessaire pour l'historique des alertes)
#    SENTINEL_API_URL=http://localhost:8000 dans le terminal 1 pour que detect.py y poste ses alertes

# 3. Dashboard
cd dashboard && npm install && npm run dev        # http://localhost:5173
```

Niveaux de la vision : présence confirmée sur 3 images (attention), présence de plus de 30 s
(attention, `--loiter`), personne tenant un couteau, des ciseaux ou une batte (critique, `--obj-conf`),
sac ou valise sans personne depuis plus de 20 s (attention, `--abandon`). Téléphone, sacs, valise et
ordinateur sont encadrés en gris pour information, sans alerte.

Le port 8081 doit être libre (`ss -ltnp | grep 8081`). Sinon, lancer detect.py avec
`--port 8091` et le dashboard avec `SENTINEL_VISION=http://localhost:8091 npm run dev`.

## Source des données

| `VITE_DATA_SOURCE` | Comportement |
|---|---|
| `api` (défaut) | Données réelles. **Caméra** : `/video` (MJPEG) et `/video/status` servis par `ai/vision/detect.py`, HUD et boîte dessinés par le dashboard. **Alertes** : `GET /api/v1/alerts`, `PATCH …/ack`. **Capteurs** : WebSocket `/ws`. **Commandes** : `POST /api/v1/commands`. |
| `mock` | Simulation hors matériel avec sélecteur de scénario (Nominal, Surchauffe lente, Fuite de gaz, Intrusion). |

Tant que l'ESP8266 n'envoie rien sur `/ws`, les capteurs **rejouent le jeu de données de la filière IA**
(`public/replay/sensor_data.csv`, copie de `ai/anomalies/data/sensor_data.csv`), une ligne par seconde.
Le rejeu part de la ligne 640 : la dérive température + gaz arrive après ~2 min, le pic de gaz après ~4 min.
En attendant le service anomalies, le score affiché est l'écart au régime normal (lignes 0-699) en écarts-types.
La première vraie mesure de l'ESP arrête le rejeu.

En développement, Vite relaie `/api` et `/ws` vers `http://localhost:8000` (`SENTINEL_API`) et `/video`
vers `http://localhost:8081` (`SENTINEL_VISION`). En production, Caddy fait le même aiguillage.

## Onglets

Vue d'ensemble · Capteurs · Vision IA · Alertes · Commandes · Système. L'onglet actif est gardé dans l'URL (`#alertes`…).

## Règles

- Aucun CDN : polices servies par `@fontsource`, icônes inline.
- Aucun HTML injecté : tous les textes reçus de l'API sont rendus comme du texte.
- JWT gardé en mémoire uniquement (`setToken` dans `src/data/api.ts`), jamais dans `localStorage`.
- WebSocket avec reconnexion automatique (1 s → 30 s) et repli en polling des alertes.

## Structure

```
src/
  data/        useSentinel (mock/api), replay (CSV IA), simulator, forecast, api, actuators
  components/  un composant par bloc de la maquette
  lib/         formatage, niveaux, LEDs, onglets
  styles/      tokens de la charte et styles
```
