---
tags: [adr]
status: accepté
date: 2026-10-05
---
# ADR-002 : MQTTS comme unique transport de l'ESP8266

## Contexte
TLS est obligatoire entre l'ESP et le serveur. L'ESP8266 dispose d'environ 40 Ko de RAM libre, et une session TLS BearSSL en consomme une grande partie.

## Décision
L'ESP n'ouvre **qu'une seule connexion TLS** : **MQTT sur TLS (8883)**, pour la télémétrie, les événements, le statut et les commandes. Il n'appelle pas `POST /api/v1/alerts` directement : ses événements arrivent par MQTT, puis le bridge de l'API les transforme en alertes. L'endpoint est appelé par les services vision et anomaly.

## Raisons
- Deux sessions TLS simultanées (MQTTS + HTTPS) risquent d'épuiser la RAM de l'ESP.
- MQTT est bidirectionnel et léger, adapté aux commandes du buzzer et des LEDs.
- LWT pour détecter un ESP hors ligne.

## Repli
Si les coachs exigent que l'ESP appelle lui-même `POST /api/v1/alerts`, on le fait en HTTPS **uniquement sur un événement**, après avoir suspendu la session MQTT. C'est à documenter et à tester avant mercredi.
