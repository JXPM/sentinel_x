---
tags: [filière, dev]
---
# 💻 DEV : firmware, API, dashboard

## Firmware ESP8266 (`firmware/`)
### Structure de `main.cpp`
- `setup()` : OLED → Wi-Fi (IP statique ou DHCP réservé) → NTP `configTime(0,0,"192.168.137.1")` → TLS → MQTT.
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
  mqtt.setServer("192.168.137.1", 8883);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onCommand);
}
```
- **Jamais `setInsecure()`** dans la version finale : le jury et les pentesteurs le chercheront.
- Afficher `ESP.getFreeHeap()` sur l'OLED et dans la télémétrie.
- LWT : `mqtt.connect(id, user, pass, "sentinel/sx-001/status", 1, true, "{\"state\":\"offline\"}")`.

### Réflexe local (mode dégradé)
Si le broker est injoignable, l'ESP fait clignoter la LED rouge et affiche **« SERVER LOST »** sur l'OLED. C'est un **statut de connectivité**, pas de la détection : la détection d'anomalies reste le rôle du modèle IA.

### Rôle des deux LEDs
| LED | Broche | Mode auto | Commande dashboard |
|---|---|---|---|
| 🟢 Verte | D0 | Allumée fixe tant que l'ESP est connecté au broker MQTTS, éteinte sinon | Auto / Allumée / Éteinte |
| 🔴 Rouge | D8 | Allumée fixe pendant une alerte, **clignotante** si le broker est perdu | Auto / Allumée / Éteinte |

D'un coup d'œil : verte seule = tout va bien ; rouge fixe = alerte ; rouge qui clignote sans verte = boîtier coupé du serveur.

## API (`server/api/`)
Voir [[API REST et WebSocket]]. Points clés :
- `POST /api/v1/alerts` validé avec Pydantic et protégé par `X-API-Key`.
- Bridge MQTT → base de données → diffusion WebSocket.
- Tests `pytest` : au minimum alertes valides et invalides, et commande publiée.

## Dashboard (`server/dashboard/`)
Maquette de référence (charte UX + dashboard interactif) : [Sentinel-X — Charte & Dashboard](https://claude.ai/artifact/V8B5XLiRPXFKkVUgVRnQ1c). Le lien est privé tant qu'il n'est pas partagé depuis le menu **Share** de la page.

Navigation par **onglets** dans la barre latérale. Toujours visibles en haut : titre de l'onglet, horloge « En direct », **bandeau d'état** (normal / attention / critique) avec bouton d'action.

| Onglet | Contenu |
|---|---|
| Vue d'ensemble | 4 tuiles capteurs, **caméra avec HUD**, 3 dernières alertes, voyants du boîtier, Analyse IA (score, prévision, type d'incident) |
| Capteurs | Tuiles + courbes température et gaz (10 dernières minutes) avec repères de référence |
| Vision IA | Caméra en grand : `<img src="/video">` (MJPEG brut de `detect.py`), HUD dessiné par le dashboard, inférence, FPS, confirmation sur 3 images |
| Alertes | Historique complet, couleur selon la sévérité, acquittement unitaire ou global ; badge du nombre d'alertes dans le menu |
| Commandes | Buzzer (pulse 2 s), LED verte et LED rouge (Auto / Allumée / Éteinte), réponse automatique on/off |
| Système | ESP, Mosquitto, API, PostgreSQL, services vision et anomalies ; lien Grafana |

### HUD de la caméra
Surcouche dessinée **côté dashboard** par-dessus le flux MJPEG (CSS/SVG, pas dans l'image) :
- coins de visée, réticule central, graduations latérales, ligne de balayage animée ;
- `REC · CAM-01`, horloge, numéro d'image, modèle et latence (`YOLOv8n · ONNX 320 · 36 ms`) ;
- cible : boîte à coins rouges, étiquette `PERSONNE 0,87 · TRK-01`, fiche « CIBLE VERROUILLÉE » (position, taille, état du PIR) ;
- objets dangereux : cadre orange `CISEAUX 0,62` ; objets d'information : cadre gris en pointillés `TÉLÉPHONE 0,55` ;
- bandeau du bas : « PRÉSENCE DÉTECTÉE · CONFIRMATION EN COURS », « PRÉSENCE CONFIRMÉE · CAMÉRA », « PRÉSENCE PROLONGÉE · 45 S », « OBJET DANGEREUX · CISEAUX », « OBJET ABANDONNÉ · 34 S », « INTRUSION CONFIRMÉE · PIR + CAMÉRA » ; sans cible : « BALAYAGE · AUCUNE CIBLE » ;
- service vision arrêté : « CAMÉRA HORS LIGNE » avec la commande à lancer.

Les boîtes viennent de `GET /video/status` (servi par `detect.py`, lu 4 fois par seconde, toutes les 2 s s'il ne répond pas) ; la caméra réelle est affichée en 4:3 pour que les boîtes tombent juste. L'animation de balayage est désactivée si l'utilisateur a demandé la réduction des animations.

### Sources de données
- `VITE_DATA_SOURCE=api` (**défaut**) : caméra via `detect.py`, alertes via l'API, capteurs via le WebSocket `/ws`. Tant que l'ESP n'envoie rien, les capteurs **rejouent `sensor_data.csv`** d'Oussama (une ligne par seconde, départ ligne 640 : dérive après ~2 min, pic de gaz après ~4 min). Score provisoire = écart au régime normal (lignes 0-699) en écarts-types, remplacé par le message `score` du service anomalies dès qu'il existe.
- `VITE_DATA_SOURCE=mock` : simulation hors matériel avec sélecteur de scénario.
- En dev, Vite relaie `/api` et `/ws` vers `:8000`, `/video` vers `:8081` (`SENTINEL_API`, `SENTINEL_VISION`). Les erreurs `ECONNREFUSED 127.0.0.1:8000` dans le terminal Vite veulent seulement dire que l'API n'est pas lancée.

Règles : pas de CDN, pas de `v-html`, token stocké en mémoire (pas de `localStorage`), reconnexion WebSocket automatique.
