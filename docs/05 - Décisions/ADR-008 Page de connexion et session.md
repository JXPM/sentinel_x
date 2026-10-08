---
tags: [adr, sécurité]
status: accepté
date: 2026-10-08
---
# ADR-008 : page de connexion et session signée (remplace `basic_auth`)

## Contexte
Le jalon 2 protégeait le dashboard par `basic_auth` de Caddy : fenêtre grise du navigateur, pas de déconnexion, pas de limite d'essais, hors charte.

## Décision
- Page `/login` statique aux couleurs de la charte, servie sans session.
- L'API vérifie le mot de passe (**PBKDF2-SHA256**, 310 000 itérations, empreinte dans l'override) et pose un cookie de session **signé HMAC**, `HttpOnly`, `SameSite=Strict`, valable 8 h.
- Caddy appelle `GET /api/v1/auth/check` (`forward_auth`) avant toute autre requête : sans session, redirection vers `/login` (navigateur) ou 401 (API, WebSocket, vidéo).
- 5 échecs en 5 minutes par adresse → 429 ; 1 s de délai par échec.

## Conséquences
- Bouton « Se déconnecter » dans le dashboard.
- `forward_auth` retire `Upgrade`/`Connection` vers `/auth/check`, sinon l'ouverture de `/ws` était refusée (403).
- Le mot de passe circule encore en HTTP sur le Wi-Fi (WPA2) tant que le HTTPS 443 n'est pas en place ; ensuite `COOKIE_SECURE=1`.
