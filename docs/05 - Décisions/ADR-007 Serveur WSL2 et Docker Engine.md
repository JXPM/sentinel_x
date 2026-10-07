---
tags: [adr, infra]
status: accepté
date: 2026-10-07
---
# ADR-007 : serveur = Ubuntu sous WSL2 + Docker Engine (et non Docker Desktop)

> Précise [[ADR-005 Option B laptop serveur]]. Mode opératoire : [[Serveur Windows (option B)]].

## Contexte
Le laptop serveur est le **PC Windows de Mathis**. Il y a installé **Ubuntu 26.04 sous WSL2** avec le **Docker Engine d'Ubuntu** (paquet `docker.io`), pas Docker Desktop. Le PC Windows diffuse le point d'accès (192.168.137.1) ; Ubuntu a sa propre adresse privée `172.31.x.x`, invisible depuis le Wi-Fi.

## Décision
- Toute la stack tourne **dans WSL2** : Mosquitto, API, dashboard (Caddy) en Docker Compose, **et la vision** (`detect.py`) en Python natif.
- Windows ne fait que **relayer** : `netsh interface portproxy` vers `127.0.0.1` pour chaque port utile (2222 SSH, 8000 API, 1883 MQTT, 8080 dashboard), avec une règle de pare-feu limitée à `192.168.137.0/24`.
- La webcam C270 est passée à WSL avec **usbipd-win** (`usbipd attach --wsl --busid 6-3`).
- Le dashboard est **servi par le serveur** (Caddy, port 8080) et non plus lancé avec `npm run dev` sur un laptop.

## Raisons
- Un seul système (Linux) pour tout : mêmes commandes que dans le reste du vault, `--source c270` (recherche par nom) fonctionne.
- Docker Engine natif : pas de licence ni de VM cachée de Docker Desktop.
- La webcam est lisible depuis WSL grâce à usbipd : plus besoin de faire tourner la vision côté Windows.

## Conséquences
- **Après chaque redémarrage** du PC : relancer `usbipd attach --wsl --busid 6-3` (la webcam revient à Windows), puis la vision dans `tmux`.
- `portproxy` vise `127.0.0.1` (et non l'IP `172.31.x.x` de WSL, qui change à chaque redémarrage).
- La vision exige **OpenCV 4.x** : avec `opencv-python` 5.0, la C270 s'ouvre via usbipd mais **aucune trame n'arrive** (`requirements.txt` à borner `< 5`).
- Ubuntu 26.04 fournit un Python trop récent pour `numpy < 2.3` : le `.venv` de la vision est créé en **Python 3.12 avec `uv`**.
- `equipe` est dans le groupe `docker` (équivalent root) et `video` : à noter dans la [[Matrice de sécurité]].
- Pare-feu : il n'y a pas d'`ufw` à régler dans WSL ; c'est le **pare-feu Windows** (et `portproxy`) qui décide de ce qui est joignable depuis le Wi-Fi.

## Alternatives écartées
- **Docker Desktop + vision sous Windows** (plan initial) : deux environnements, recherche de la caméra par numéro seulement.
- **Mode réseau `mirrored` de WSL** : plus simple sur le papier, mais le relais `portproxy` marchait déjà pour le SSH ; on a gardé le même mécanisme.
