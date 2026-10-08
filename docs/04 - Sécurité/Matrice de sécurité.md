---
tags: [sécurité, livrable]
---
# 🔐 Matrice de sécurité (état au 8 octobre, reprise dans le dossier PDF)

| Actif | Menace | Mesure | Preuve | Statut |
|---|---|---|---|---|
| Lien ESP → broker | Écoute, MitM | MQTTS 8883, TLS 1.2, CA du groupe **épinglée** dans le firmware (`setTrustAnchors`), heure NTP avant publication | Wireshark : clair avant, TLSv1.2 *Application Data* après | ✅ |
| Broker MQTT | Accès anonyme, fausses données, commande du boîtier | `allow_anonymous false`, 3 comptes, **ACL par topic** | publication anonyme → `not authorised` | ✅ |
| Broker MQTT | Saturation | `max_connections`, `message_size_limit`, quota mémoire du conteneur | config + `docker stats` | ☐ |
| API | Accès direct en contournant le dashboard | API liée à `127.0.0.1`, joignable seulement par Caddy | `Test-NetConnection … -Port 8000` → `False` | ✅ |
| API | Données malformées | validation Pydantic des schémas | requête invalide → 422 | ✅ |
| Dashboard | Accès non autorisé | page de connexion, mot de passe **PBKDF2**, session **HMAC** en cookie `HttpOnly`, vérifiée par Caddy (`forward_auth`) | sans session : 302 `/login`, API et WebSocket → 401 | ✅ |
| Dashboard | Mots de passe devinés | blocage après 5 échecs en 5 min par IP | 6e essai → 429 | ✅ |
| Dashboard | Écoute du mot de passe | HTTPS 443, cookie `Secure`, HSTS | cadenas du navigateur | ☐ |
| Dashboard | XSS via une alerte | échappement natif React | alerte contenant `<script>` | ✅ |
| Base de données | Accès direct | aucun port publié, mot de passe hors Git | `docker compose ps` | ✅ |
| Hôte | Exposition de services | `portproxy` limité à 2222/8080/8883, pare-feu limité à `192.168.137.0/24` | scan des ports depuis le Wi-Fi | ✅ |
| Hôte (SSH) | Force brute | accès par clé | connexion par clé testée | ✅ |
| Conteneurs | Élévation de privilèges | API et IA non-root ; `cap_drop: ALL`, `no-new-privileges` à généraliser | `docker-bench-security` | ◐ |
| Secrets | Fuite par Git | `config.h`, `ca_cert.h`, `passwd`, `docker-compose.override.yml` hors Git, modèles factices fournis | historique Git | ✅ |
| Présence du boîtier | Neutralisation discrète | Last Will `offline` publié par le broker | débrancher le boîtier → `offline` | ✅ |

Failles et preuves détaillées : [[Failles, mesures et preuves]]. Décisions : [[ADR-008 Page de connexion et session]].
