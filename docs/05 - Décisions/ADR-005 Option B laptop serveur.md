---
tags: [adr]
status: accepté
date: 2026-10-05
---
# ADR-005 : Option B, un laptop sert de serveur local

> Remplace [[ADR-001 Option A Raspberry Pi 5]]. Précisée par [[ADR-007 Serveur WSL2 et Docker Engine]] (WSL2 + Docker Engine au lieu de Docker Desktop, vision dans WSL).

## Contexte
L'équipe n'a pas de Raspberry Pi 5. Le sujet autorise l'option B : le laptop d'un membre sert de serveur local et de point d'accès.

## Décision
**Option B.** Un laptop de l'équipe fait tourner le broker, l'API, la base et le dashboard (Docker Compose), ainsi que les services IA.

## Conséquences
- **Vision hors Docker** : Docker Desktop (Windows/Mac) n'accède pas à une webcam USB, donc `detect.py` tourne directement sur le laptop, dans le `.venv`, et envoie ses alertes à l'API dans Docker (`SENTINEL_API_URL`).
- **Plus de CPU** qu'un Pi 5 : la contrainte < 100 ms par image est plus facile à tenir, mais on garde ONNX 320 ([[ADR-004 Vision en ONNX Runtime]]) pour rester léger.
- Images ARM64 plus obligatoires (le laptop est en x86_64).
- La démo dépend d'un laptop personnel : désactiver la mise en veille et les mises à jour automatiques le jour J, et vérifier le pare-feu.
- Le point d'accès Wi-Fi et le boîtier sont à revoir avec l'INFRA et le Fablab.
