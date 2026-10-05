---
tags: [filière, dev]
---
# 💻 DEV : firmware, API, dashboard

## Firmware ESP8266 (`firmware/`)
### Structure de `main.cpp`
- `setup()` : OLED → Wi-Fi (IP statique ou DHCP réservé) → NTP `configTime(0,0,"192.168.10.1")` → TLS → MQTT.
- `loop()` **non bloquant** (`millis()`, aucun `delay()` long) :
  - toutes les 2 s : lecture DHT22 + MQ-2 → JSON (ArduinoJson) → `telemetry`
  - interruption ou polling du PIR → `event` sur changement d'état
  - `mqtt.loop()` → callback `cmd` → buzzer et LEDs
  - toutes les 1 s : rafraîchissement de l'OLED (IP, RSSI, état MQTT, T/H/gaz, dernière alerte)
  - reconnexion avec backoff exponentiel ; watchdog `ESP.wdtFeed()`

### TLS sur ESP8266 (BearSSL)
```cpp
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "secrets.h"            // WIFI_SSID, WIFI_PASS, MQTT_USER, MQTT_PASS, CA_CERT

BearSSL::WiFiClientSecure net;
BearSSL::X509List caCert(CA_CERT);
PubSubClient mqtt(net);

void setupTls() {
  net.setTrustAnchors(&caCert);          // vérifie le certificat du serveur via notre CA
  // net.setBufferSizes(1024, 1024);     // seulement si le serveur accepte MFLN (tester probeMaxFragmentLength)
  mqtt.setServer("192.168.10.1", 8883);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onCommand);
}
```
- **Jamais `setInsecure()`** dans la version finale : le jury et les pentesteurs le chercheront.
- Afficher `ESP.getFreeHeap()` sur l'OLED et dans la télémétrie.
- LWT : `mqtt.connect(id, user, pass, "sentinel/sx-001/status", 1, true, "{\"state\":\"offline\"}")`.

### Réflexe local (mode dégradé)
Si le broker est injoignable, l'ESP fait clignoter la LED rouge et affiche **« SERVER LOST »** sur l'OLED. C'est un **statut de connectivité**, pas de la détection : la détection d'anomalies reste le rôle du modèle IA.

## API (`server/api/`)
Voir [[API REST et WebSocket]]. Points clés :
- `POST /api/v1/alerts` validé avec Pydantic et protégé par `X-API-Key`.
- Bridge MQTT → base de données → diffusion WebSocket.
- Tests `pytest` : au minimum alertes valides et invalides, et commande publiée.

## Dashboard (`server/dashboard/`)
| Zone | Contenu |
|---|---|
| Bandeau statut | ESP online/offline, RSSI, heap, uptime ; IA active ; latence vision |
| Courbes | Température, humidité, gaz (5 dernières minutes, glissant) + **courbe du score d'anomalie** |
| Webcam | `<img src="/video">` (MJPEG annoté avec les boîtes) |
| Alertes | Liste en temps réel, couleur selon la sévérité, bouton d'acquittement |
| Commandes | Buzzer (pulse), LED rouge, LED verte, mode auto on/off |
| Monitoring | Lien vers Grafana ou mini-jauges CPU/RAM/température |

Règles : pas de CDN, pas de `v-html`, token stocké en mémoire (pas de `localStorage`), reconnexion WebSocket automatique.
