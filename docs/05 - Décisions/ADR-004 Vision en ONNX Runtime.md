---
tags: [adr]
status: accepté
date: 2026-10-05
---
> [!note] Option B : la vision tourne sur le laptop serveur, en Python natif ; le choix ONNX reste valable (léger, rapide, sans PyTorch à l'exécution).

# ADR-004 : vision avec YOLOv8n en ONNX Runtime à 320 px

## Décision
Exporter YOLOv8n en ONNX (entrée 320×320) **sur un laptop**, et ne faire tourner sur le Pi que `onnxruntime` + `opencv-python-headless`.

## Raisons
- Évite d'installer PyTorch sur le Pi : image Docker beaucoup plus légère, moins de RAM.
- Entrée 320 : latence compatible avec l'objectif de moins de 100 ms sur le CPU du Pi 5 (**à mesurer** mardi).

## Alternatives
- Ultralytics + export NCNN sur le Pi : plus simple à coder, mais l'image est plus lourde.
- Détecteur HOG d'OpenCV : très léger mais nettement moins précis, gardé comme solution de secours.
