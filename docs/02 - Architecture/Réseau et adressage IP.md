---
tags: [architecture, réseau, infra]
---
# 🌐 Réseau et adressage IP (option B)

> [!important] Option B
> Le réseau de démo est le **point d'accès mobile du laptop Windows** serveur. La mise en place pas à pas est dans [[Serveur Windows (option B)]].

## Topologie
- Point d'accès mobile Windows `SENTINEL-X-G<n>`, WPA2, **bande 2,4 GHz** (l'ESP8266 ne gère que cette bande).
- Le laptop serveur est la passerelle : **192.168.137.1** (adresse fixe imposée par Windows).
- Windows distribue les adresses (DHCP) dans **192.168.137.0/24**. Pas de réservation possible : l'IP de l'ESP peut changer, ce n'est pas gênant puisque c'est lui qui se connecte au serveur.
- Windows **partage la connexion Internet** du laptop (NAT) : le sous-réseau n'est pas étanche. Compromis assumé et documenté dans la [[Matrice de sécurité]].
- **Plan B** : routeur Wi-Fi dédié sans accès Internet → réseau vraiment isolé, réservations DHCP.

## Plan d'adressage : 192.168.137.0/24
| Adresse | Équipement | Attribution |
|---|---|---|
| 192.168.137.1 | Laptop Windows serveur (passerelle, DHCP, NTP, broker, API) | fixe (Windows) |
| 192.168.137.x | ESP8266 `sx-001` | DHCP (relever l'IP dans Paramètres → Point d'accès mobile) |
| 192.168.137.x | Laptop de démo / dashboard | DHCP |

Pas de serveur DNS local : on utilise l'IP `192.168.137.1` partout (firmware, certificat, navigateur). Optionnel : ajouter `192.168.137.1 sentinel.lan` dans le fichier `hosts` du laptop de démo.

## NTP pour l'ESP (indispensable à la validation TLS)
Le service de temps Windows (`w32time`) est activé en serveur NTP sur le laptop ; l'ESP appelle `configTime(0, 0, "192.168.137.1")`. Commandes dans [[Serveur Windows (option B)]].

## Ports ouverts sur le laptop serveur, et rien d'autre
| Port | Service | Autorisé depuis |
|---|---|---|
| 8883/tcp | Mosquitto (TLS) | 192.168.137.0/24 |
| 443/tcp | Caddy (dashboard, API, Grafana) | 192.168.137.0/24 |
| 123/udp | NTP (w32time) | 192.168.137.0/24 |
| 1883/tcp, 8000/tcp | **Jalon 1 uniquement** (tests sans TLS) | 192.168.137.0/24, **à fermer avant jeudi** |

Règles du pare-feu Windows : voir [[Serveur Windows (option B)]].
