---
tags: [architecture, réseau, infra]
---
# 🌐 Réseau et adressage IP

## Topologie
- `wlan0` (Wi-Fi intégré du Pi 5) = **point d'accès** `SENTINEL-X-G<n>`, en WPA2-PSK (CCMP), sur 2,4 GHz (l'ESP8266 ne gère que cette bande).
- `eth0` = accès Internet de l'école, **uniquement pour l'installation**. Fermé par UFW pendant la démo.
- **Pas de routage** entre `wlan0` et `eth0` (`net.ipv4.ip_forward=0`) : le sous-réseau est étanche.
- **Isolation des clients** (`ap_isolate=1`) : les appareils connectés au point d'accès ne se voient pas entre eux, ce qui limite l'usurpation ARP entre clients.

## Plan d'adressage : 192.168.10.0/24
| Adresse | Équipement | Attribution |
|---|---|---|
| 192.168.10.1 | Raspberry Pi 5 (passerelle, DHCP, DNS, NTP) | statique |
| 192.168.10.10 | ESP8266 `sx-001` | réservation DHCP par MAC |
| 192.168.10.11 | ESP8266 de secours `sx-002` | réservation DHCP |
| 192.168.10.50 – .99 | Laptops de l'équipe | pool DHCP |
| 192.168.10.100 | Laptop de démo | réservation DHCP |

Nom local : `sentinel.lan` → 192.168.10.1 (servi par dnsmasq).

## `/etc/hostapd/hostapd.conf`
```ini
interface=wlan0
driver=nl80211
country_code=FR
ssid=SENTINEL-X-G<n>
hw_mode=g
channel=6            ; choisir 1, 6 ou 11 selon le canal le moins chargé
wmm_enabled=1
ap_isolate=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
wpa_passphrase=<<DANS .env, ≥ 20 caractères>>
```
> Sous Bookworm, NetworkManager gère `wlan0` : lancer `nmcli dev set wlan0 managed no` avant d'activer hostapd.
> Variante possible : `nmcli` en mode `ap` avec `ipv4.method manual`, et surtout pas `shared`, qui active du NAT vers `eth0`.

## `/etc/dnsmasq.d/sentinel.conf`
```ini
interface=wlan0
bind-interfaces
domain-needed
bogus-priv
no-resolv
dhcp-range=192.168.10.50,192.168.10.99,255.255.255.0,12h
dhcp-host=<MAC_ESP>,sx-001,192.168.10.10
dhcp-host=<MAC_LAPTOP_DEMO>,demo,192.168.10.100
dhcp-option=option:ntp-server,192.168.10.1
address=/sentinel.lan/192.168.10.1
```

## IP statique de `wlan0`
```bash
sudo ip addr add 192.168.10.1/24 dev wlan0   # à rendre persistant (systemd-networkd ou nmcli)
```

## NTP pour l'ESP (indispensable à la validation TLS)
`/etc/chrony/conf.d/sentinel.conf` :
```
allow 192.168.10.0/24
local stratum 10
```

## Ports ouverts sur 192.168.10.1, et rien d'autre
| Port | Service | Autorisé depuis |
|---|---|---|
| 8883/tcp | Mosquitto (TLS) | 192.168.10.0/24 |
| 443/tcp | Caddy (dashboard, API, Grafana) | 192.168.10.0/24 |
| 22/tcp | SSH (clés uniquement) | laptops de l'équipe, avec limitation de débit |
| 53, 67/udp | DNS, DHCP | wlan0 |
| 123/udp | NTP | wlan0 |

Les règles UFW et le piège des ports Docker sont décrits dans [[Matrice de sécurité]].
