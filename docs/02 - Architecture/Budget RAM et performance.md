---
tags: [architecture, performance]
---
# 📊 Budget RAM et performance (laptop Windows serveur)

> [!info] Option B
> Un laptop a bien plus de marge qu'un Pi 5. La contrainte principale devient **Docker Desktop (WSL2)**, qui prend par défaut jusqu'à la moitié de la RAM. Le limiter avec `.wslconfig` si le laptop n'a que 8 Go ([[Serveur Windows (option B)]]).

| Composant | RAM estimée | Où |
|---|---|---|
| Windows + Docker Desktop (VM WSL2) | ~2–3 Go | hôte |
| Mosquitto | ~10 Mo | Docker |
| PostgreSQL | ~100–150 Mo | Docker |
| API FastAPI | ~80–120 Mo | Docker |
| anomaly (scikit-learn) | ~120 Mo | Docker |
| Caddy | ~30 Mo | Docker |
| Prometheus + Grafana (optionnel) | ~300 Mo | Docker |
| **vision** (ONNX Runtime + OpenCV) | ~300–500 Mo | **Python natif** |

> [!tip] À mesurer, pas à supposer
> `docker stats --no-stream` et le Gestionnaire des tâches pendant que tout tourne : ce sont des données prouvées pour le dossier.

## Vision : objectif sous 100 ms par trame
- Capture **640×480**, puis letterbox en **320×320** pour le modèle.
- YOLOv8n en ONNX Runtime (CPU, 4 threads) : sur un CPU de laptop, on s'attend à bien moins de 100 ms. **À mesurer sur le laptop serveur** et à noter dans [[IA]].
- Ne garder que la classe `person`, avec une confiance ≥ 0,5 et une confirmation sur **3 trames consécutives**.
- Afficher les ms d'inférence et le FPS pendant la démo : le jury veut voir la stack.

## Énergie
Laptop **sur secteur**, mise en veille désactivée : sur batterie, Windows bride le CPU et la latence de la vision augmente.
