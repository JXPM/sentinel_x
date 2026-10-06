---
tags: [adr]
status: remplacé
date: 2026-10-05
---
# ADR-001 : Option A, Raspberry Pi 5 embarqué

> [!warning] Remplacé par [[ADR-005 Option B laptop serveur]] : l'équipe n'a pas de Pi 5.

## Contexte
Le sujet propose l'option A (Pi 5 dans le boîtier) ou l'option B (laptop d'un membre comme serveur et point d'accès).

## Décision
**Option A.**

## Raisons
- **Produit autonome** et crédible (*Edge Node*) : un seul boîtier, un seul câble d'alimentation. Fort impact pour le marketing, la vidéo et le pitch.
- **Démo indépendante** d'un laptop personnel (mises à jour Windows, pare-feu, mise en veille…).
- Environnement **Linux maîtrisé** pour le durcissement (UFW, SSH, Docker), plus facile à prouver.
- Image système **clonable** sur SD en cas de panne.

## Conséquences et compromis
- Images **ARM64** obligatoires.
- **4 Go de RAM et CPU limité** : vision optimisée en ONNX à 320 ([[ADR-004 Vision en ONNX Runtime]]), limites mémoire sur les conteneurs ([[Budget RAM et performance]]).
- **Thermique** : Active Cooler et compartiments séparés ([[Boîtier et thermique]]).
- Le Wi-Fi intégré sert de point d'accès, donc l'accès Internet passe par eth0 pendant l'installation.
