# Bibliothèques à installer par spé

## DEV : firmware ESP8266 (PlatformIO `lib_deps`)
- knolleary/PubSubClient
- bblanchon/ArduinoJson
- adafruit/DHT sensor library
- adafruit/Adafruit Unified Sensor
- adafruit/Adafruit SSD1306
- adafruit/Adafruit GFX Library

## DEV : API (Python)
```
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings sqlalchemy asyncpg paho-mqtt "python-jose[cryptography]" "passlib[bcrypt]" prometheus-fastapi-instrumentator pytest httpx
```

## DEV : dashboard (npm)
```
npm i vue chart.js vue-chartjs chartjs-adapter-date-fns date-fns
npm i -D vite eslint prettier
```

## IA : vision
```
pip install onnxruntime opencv-python-headless numpy requests flask
pip install ultralytics   # sur laptop uniquement, pour exporter le modèle en ONNX
```

## IA : anomalies
```
pip install scikit-learn pandas numpy joblib paho-mqtt "psycopg[binary]" requests
pip install jupyterlab matplotlib seaborn   # notebooks
```

## INFRA : Raspberry Pi
```
sudo apt install hostapd dnsmasq chrony docker-ce docker-compose-plugin v4l-utils mosquitto-clients
```

## CYBER
```
sudo apt install ufw fail2ban openssl nmap wireshark lynis
```
