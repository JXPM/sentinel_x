---
tags: [sécurité, livrable, pentest]
---
# 🛡️ Failles, mesures et preuves (pentest croisé)

> [!info] Source
> Documents de Mathis sur la branche `MathisTest` : *Sécurité Sentinel-X — failles, mesures et preuves*, *Firmware Sentinel-X — Sécurité*, *Configuration de l'ESP*. F4 est mise à jour : `basic_auth` a été remplacé par une page de connexion le 8 octobre.

| Faille | Risque | Mesure | Preuve |
|---|---|---|---|
| **F1** Broker MQTT anonyme, sans ACL | n'importe qui sur le Wi-Fi lit la télémétrie, injecte des mesures, désarme le boîtier | `allow_anonymous false`, `password_file`, ACL par compte (`esp`, `vision`, `api`) | `{"action":"disarm"}` en anonyme → `Connection Refused: not authorised` |
| **F2** API exposée | appel direct de `POST /api/v1/commands` sans passer par le dashboard | port publié sur `127.0.0.1:8000` seulement | `Test-NetConnection 192.168.137.1 -Port 8000` → `TcpTestSucceeded : False` |
| **F3** MQTT en clair | sniffing des mesures **et du mot de passe** (paquet CONNECT) | MQTTS 8883, certificat EC P-256 signé par la CA du groupe, CA épinglée côté ESP | T1 anonyme refusé · T2 sans TLS échoue · T3/T4 `esp` en TLS OK ; Wireshark avant/après |
| **F4** Dashboard sans authentification | commandes du boîtier accessibles à tous | **page de connexion** (PBKDF2, session HMAC `HttpOnly`, blocage après 5 essais), Caddy refuse tout sans session | sans session : 302 vers `/login`, API/WebSocket 401 ; 6e essai → 429 |
| Surface réseau | services internes joignables | suppression des `portproxy` 1883, 8000, 443 | seuls 2222, 8080, 8883 répondent |

## Certificat du serveur
`CN=sentinel.local`, émis par `CN=Sentinel-X CA` (interne). SAN : IP `192.168.137.1`, DNS `sentinel.local`, `mosquitto`, `localhost`. Clé EC P-256, signature ECDSA-SHA256, validité 10 ans.

## Côté firmware (v2.8.2)
- `BearSSL::WiFiClientSecure` + `setTrustAnchors(CA)` : seule la CA du groupe est acceptée.
- `setX509Time()` : le boîtier attend l'heure NTP avant de valider le certificat et de publier.
- Secrets dans `config.h` et `ca_cert.h`, hors Git ; `#error` si un secret manque ; modèle `config.example.h`.
- Préfixe de topics construit depuis `GROUP_ID`/`DEVICE_ID`, identique à l'ACL du compte `esp`.
- Last Will `offline` : une coupure ou un sabotage du boîtier devient visible.

## Reste à prouver ou à faire
- [ ] Capture Wireshark « après » (TLSv1.2 sur 8883) à ajouter au rapport.
- [ ] HTTPS sur 443 pour le dashboard (le mot de passe circule encore en HTTP sur le Wi-Fi WPA2).
