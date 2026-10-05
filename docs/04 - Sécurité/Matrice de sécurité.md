---
tags: [sécurité, livrable]
---
# 🔐 Matrice de sécurité (à intégrer au dossier PDF)

| Actif | Menace | Mesure | Preuve | Statut |
|---|---|---|---|---|
| Lien ESP → broker | Écoute, MitM | **TLS 1.2**, CA locale, l'ESP vérifie le certificat serveur (`setTrustAnchors`) | Capture Wireshark | ☐ |
| Broker MQTT | Accès anonyme, publication de fausses données | `allow_anonymous false`, mot de passe par client, **ACL par topic**, 1883 non publié | `mosquitto_sub` sans identifiants refusé | ☐ |
| Broker MQTT | Saturation | `max_connections 20`, `message_size_limit 4096`, limite mémoire du conteneur | Config + `docker stats` | ☐ |
| API | Injection d'alertes | `X-API-Key` sur `POST /alerts`, validation Pydantic | `curl` sans clé → 401 | ☐ |
| Dashboard | Accès non autorisé | Login, JWT courte durée, HTTPS uniquement, HSTS | Capture | ☐ |
| Dashboard | XSS via message d'alerte | Échappement Vue (pas de `v-html`), en-têtes de sécurité | Test avec une alerte contenant `<script>` | ☐ |
| Hôte (SSH) | Brute force | **Clés uniquement**, `PermitRootLogin no`, `AllowUsers`, fail2ban, `ufw limit` | `sshd -T`, extrait de config | ☐ |
| Hôte (réseau) | Exposition de services | **UFW deny par défaut**, ports Docker liés à 192.168.10.1, chaîne `DOCKER-USER` | `nmap` de notre Pi | ☐ |
| Wi-Fi | Accès au sous-réseau | WPA2-CCMP, phrase de passe ≥ 20 caractères, `ap_isolate=1`, pas de routage vers eth0 | Config hostapd | ☐ |
| Conteneurs | Évasion, escalade | utilisateurs non-root, `cap_drop: ALL`, `no-new-privileges`, `read_only`, réseau `internal` | `docker-bench-security` | ☐ |
| Secrets | Fuite via Git | `.env`, `secrets.h` et clés gitignorés ; `.env.example` factice | `git log -p` vérifié | ☐ |
| Disponibilité | Panne ou plantage | `restart: unless-stopped`, healthchecks, SD clonée | — | ☐ |

## Limites connues (à assumer devant le jury)
- L'ESP8266 ne gère pas les **trames de management protégées (PMF/802.11w)** : une désauthentification Wi-Fi peut le déconnecter. On compense par une reconnexion automatique et un statut `offline` visible (LWT).
- Pas d'authentification mutuelle par certificat client sur l'ESP (contrainte de RAM) : l'ESP s'authentifie par identifiant et mot de passe **à l'intérieur** du tunnel TLS.

---
## Durcissement de l'hôte (`infra/hardening/`)
### SSH : `/etc/ssh/sshd_config.d/sentinel.conf`
```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers <utilisateur_admin>
MaxAuthTries 3
X11Forwarding no
```

### UFW
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw default deny routed
sudo ufw allow in on wlan0 to any port 67 proto udp      # DHCP
sudo ufw allow in on wlan0 to any port 53                # DNS
sudo ufw allow in on wlan0 to any port 123 proto udp     # NTP
sudo ufw allow in on wlan0 to 192.168.10.1 port 8883 proto tcp
sudo ufw allow in on wlan0 to 192.168.10.1 port 443 proto tcp
sudo ufw limit in on wlan0 to 192.168.10.1 port 22 proto tcp
sudo ufw enable
```

### ⚠️ Docker contourne UFW
Les ports publiés par Docker passent par la chaîne `FORWARD` (via DNAT) et **non par `INPUT`**, donc UFW ne les filtre pas. Deux protections :
1. Lier chaque port à l'IP du point d'accès (`"192.168.10.1:443:443"`), comme dans [[Stack Docker Compose]].
2. Ajouter dans `DOCKER-USER` une règle qui **refuse tout trafic arrivant par `eth0`** vers les conteneurs (script `infra/hardening/docker-user.sh`, ou l'outil `ufw-docker`).

### Docker
- L'utilisateur admin est dans le groupe `docker` **uniquement pour la semaine** ; on le documente comme compromis (le mode rootless est une amélioration possible).
- `docker-bench-security` avant et après, avec les résultats dans le dossier.
