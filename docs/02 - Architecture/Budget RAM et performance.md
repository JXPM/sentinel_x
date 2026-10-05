---
tags: [architecture, performance]
---
# 📊 Budget RAM et performance (Raspberry Pi 5, 4 Go)

| Composant | RAM estimée | Limite Docker |
|---|---|---|
| Raspberry Pi OS Lite + hostapd, dnsmasq, chrony | ~250 Mo | — |
| Mosquitto | ~10 Mo | 64 Mo |
| PostgreSQL | ~100–150 Mo | 256 Mo |
| API FastAPI | ~80–120 Mo | 256 Mo |
| **vision** (ONNX Runtime + OpenCV) | ~300–500 Mo | 768 Mo |
| anomaly (scikit-learn) | ~120 Mo | 256 Mo |
| Caddy | ~30 Mo | — |
| Prometheus (rétention 2 jours) + node-exporter + cAdvisor | ~250 Mo | — |
| Grafana | ~120 Mo | — |
| **Total** | **≈ 1,3 – 1,6 Go** | marge d'environ 2 Go ✅ |

> [!tip] À mesurer, pas à supposer
> Faire `docker stats --no-stream` mardi soir et remplacer les estimations par les valeurs réelles : c'est une donnée prouvée pour le dossier.

## Vision : objectif sous 100 ms par trame
- Capture **640×480 en MJPG** (`cv2.CAP_PROP_FOURCC`), puis redimensionnement en **320×320** pour le modèle.
- YOLOv8n en ONNX Runtime (CPU, 4 threads) : ordre de grandeur de **quelques dizaines de ms** à 320 sur un Pi 5. **À mesurer** mardi.
- Ne garder que la classe `person`, avec une confiance ≥ 0,5 et une confirmation sur **3 trames consécutives**.
- Mesurer et publier `t_capture`, `t_infer`, `t_post` et le FPS : on les affiche dans le dashboard pendant la démo, car le jury veut voir la stack.

## Température
- Surveiller `vcgencmd measure_temp` (exposé par node-exporter via thermal_zone). Le Pi 5 bride ses performances vers 85 °C.
- Ne pas descendre sous l'Active Cooler.
