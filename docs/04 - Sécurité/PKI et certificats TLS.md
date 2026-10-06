---
tags: [sécurité, tls]
---
# 📜 PKI locale et certificats TLS

Courbe **ECDSA P-256** : handshake plus léger que RSA 2048 pour l'ESP8266, et gérée par BearSSL.

## `pki/gen-pki.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
OUT="$(dirname "$0")/out"; mkdir -p "$OUT"; cd "$OUT"

# Autorité de certification
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -x509 -new -key ca.key -sha256 -days 365 \
  -subj "/O=AetherCorp/CN=Sentinel-X Local Root CA" -out ca.crt

# Certificat serveur (Mosquitto + Caddy)
openssl ecparam -name prime256v1 -genkey -noout -out server.key
openssl req -new -key server.key -subj "/O=AetherCorp/CN=sentinel.lan" -out server.csr
cat > server.ext <<EXT
basicConstraints=CA:FALSE
keyUsage=digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:sentinel.lan,IP:192.168.137.1
EXT
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 90 -sha256 -extfile server.ext -out server.crt
chmod 600 *.key
openssl verify -CAfile ca.crt server.crt
```

## Mosquitto : `server/mosquitto/config/mosquitto.conf`
```
per_listener_settings true

listener 8883
cafile   /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile  /mosquitto/certs/server.key
tls_version tlsv1.2
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl

listener 1883          # réseau Docker interne uniquement, jamais publié
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl

max_connections 20
message_size_limit 4096
persistence true
persistence_location /mosquitto/data/
log_dest stdout
log_type error
log_type warning
log_type notice
```

## Côté ESP8266
- `ca.crt` est collé dans `firmware/include/secrets.h` (gitignoré) sous forme de `const char CA_CERT[] PROGMEM = R"EOF(...)EOF";`.
- L'ESP doit avoir **l'heure correcte** pour valider les dates du certificat, d'où le NTP servi par le laptop serveur (`w32time`).

## Vérifications
```bash
openssl s_client -connect 192.168.137.1:8883 -CAfile pki/out/ca.crt -brief
testssl.sh 192.168.137.1:8883
mosquitto_pub -h 192.168.137.1 -p 8883 --cafile pki/out/ca.crt -t test -m x   # doit être refusé (pas d'identifiants)
```

## Rotation et hygiène
- Les clés ne quittent jamais le laptop serveur ou le laptop CYBER ; `pki/out/` est gitignoré.
- Après le workshop, on régénère la PKI avant la finale du 17 novembre.
