# Architecture SENTINEL-X

## Architecture générale

CAPTEURS
- DHT22 : température / humidité
- MQ-2 : gaz / fumée
- PIR : détection de présence

        ↓

ESP8266
- Langage : C++
- Lecture des capteurs
- Préparation des données
- Envoi des données au serveur
- Gestion LED / Buzzer / écran OLED

        ↓ Wi-Fi

BACKEND
- Python
- FastAPI
- API REST / WebSocket
- Réception des données des capteurs
- Centralisation des alertes

Endpoint déjà testé :
POST /api/v1/alerts

Exemple de données :

{
  "temperature": 24.5,
  "humidity": 55,
  "gas": 120,
  "presence": true
}

        ↓

FRONTEND
- React
- Dashboard de supervision
- Affichage température
- Affichage humidité
- Affichage gaz
- Affichage présence
- Affichage état du système

        ↓

UTILISATEUR / SUPERVISEUR


## Flux de données

### Capteurs vers le dashboard

Capteurs
→ ESP8266
→ Backend FastAPI
→ React
→ Dashboard


### Commandes du dashboard vers le boîtier

React
→ Backend FastAPI
→ ESP8266
→ LED / Buzzer


## Technologies

- Firmware : C++ / ESP8266
- Backend : Python / FastAPI
- Frontend : React
- Communication : HTTP/HTTPS ou MQTT (à valider avec l'équipe)
- Broker MQTT : Mosquitto
- Conteneurisation : Docker / Docker Compose