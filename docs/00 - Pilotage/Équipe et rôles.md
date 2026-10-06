---
tags: [pilotage]
---
# 👥 Équipe et rôles
> [!todo] À remplir au kick-off.

| Membre | Filière | Briques possédées | Backup | Contact |
|---|---|---|---|---|
| Johan | IA | `ai/vision`, intégration vision → API, documentation IA | Oussama | |
| Oussama | IA | `ai/anomalies` (données, features, modèles) | Johan | |
| Anne | DEV | API (`app/`), dashboard | | |
| | DEV | `firmware/` | | |
| | INFRA | Laptop serveur Windows, Docker Compose, point d'accès, monitoring | | |
| | CYBER | PKI/TLS, durcissement, rapport d'audit, pentest | | |
| | (au choix) | CAO Fusion360, laser, vidéo | | |

## Rôles transverses
- **Intégrateur** : garant du `docker compose up` sur le laptop serveur et du test de bout en bout chaque soir.
- **Gardien du dépôt** : relit les PR et vérifie l'absence de secrets ([[Conventions Git]]).
- **Maître du temps** : chronomètre les répétitions ([[Pitch et timing]]).
- **Scribe** : met à jour le [[Planning de la semaine]] et le journal du jour.

## Contrats entre filières (à figer le lundi)
| Contrat | Producteur → Consommateur | Où |
|---|---|---|
| JSON de télémétrie | firmware → API, IA | [[Flux MQTT et topics]] |
| JSON des alertes | IA, firmware → API | [[API REST et WebSocket]] |
| Commandes actionneurs | Dashboard → API → ESP | [[Flux MQTT et topics]] |
| Comptes MQTT et ACL | CYBER → tous | [[Matrice de sécurité]] |
| Schéma SQL | DEV → IA (entraînement) | [[Base de données]] |
