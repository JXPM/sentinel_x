---
tags: [architecture, docker, infra]
---
# 🐳 Stack Docker Compose (squelette)

```yaml
# server/docker-compose.yml
x-hardening: &hardening
  restart: unless-stopped
  security_opt: ["no-new-privileges:true"]
  cap_drop: ["ALL"]
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "3" }   # maîtrise du volume de logs (MCO)

networks:
  edge: {}                      # Caddy et Mosquitto (ports publiés)
  backend: { internal: true }   # aucun accès extérieur

services:
  mosquitto:
    <<: *hardening
    image: eclipse-mosquitto:2
    user: "1883:1883"
    ports: ["192.168.10.1:8883:8883"]       # lié à l'IP du point d'accès uniquement
    volumes:
      - ./mosquitto/config:/mosquitto/config:ro
      - ../pki/out:/mosquitto/certs:ro
      - mosq-data:/mosquitto/data
    networks: [edge, backend]
    deploy: { resources: { limits: { memory: 64m } } }

  db:
    <<: *hardening
    image: postgres:16-alpine
    cap_add: [CHOWN, SETUID, SETGID, FOWNER, DAC_OVERRIDE]   # requis par l'image postgres
    env_file: .env
    volumes: [pg-data:/var/lib/postgresql/data, ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro]
    networks: [backend]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"], interval: 10s }
    deploy: { resources: { limits: { memory: 256m } } }

  api:
    <<: *hardening
    build: ./api
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    env_file: .env
    depends_on: { db: { condition: service_healthy }, mosquitto: { condition: service_started } }
    networks: [backend]
    deploy: { resources: { limits: { memory: 256m } } }

  vision:
    <<: *hardening
    build: ../ai/vision
    user: "10002:10002"
    group_add: ["video"]
    devices: ["/dev/video0:/dev/video0"]
    read_only: true
    env_file: .env
    networks: [backend]
    deploy: { resources: { limits: { memory: 768m, cpus: "2.5" } } }

  anomaly:
    <<: *hardening
    build: ../ai/anomaly
    user: "10003:10003"
    read_only: true
    volumes: [../ai/anomaly/models:/app/models:ro]
    env_file: .env
    networks: [backend]
    deploy: { resources: { limits: { memory: 256m } } }

  caddy:
    <<: *hardening
    image: caddy:2-alpine
    cap_add: [NET_BIND_SERVICE]
    ports: ["192.168.10.1:443:443"]
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./dashboard/dist:/srv:ro
      - ../pki/out:/certs:ro
    networks: [edge, backend]

  prometheus:   { <<: *hardening, image: prom/prometheus, networks: [backend], command: ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.retention.time=2d"], volumes: ["./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro"] }
  node-exporter: { <<: *hardening, image: prom/node-exporter, networks: [backend], pid: host, volumes: ["/:/host:ro,rslave"], command: ["--path.rootfs=/host"] }
  cadvisor:     { <<: *hardening, image: gcr.io/cadvisor/cadvisor, networks: [backend], command: ["--docker_only=true", "--housekeeping_interval=10s"], volumes: ["/:/rootfs:ro", "/var/run:/var/run:ro", "/sys:/sys:ro", "/var/lib/docker/:/var/lib/docker:ro"] }
  grafana:      { <<: *hardening, image: grafana/grafana, networks: [backend], env_file: .env, environment: ["GF_SERVER_ROOT_URL=https://sentinel.lan/grafana/", "GF_SERVER_SERVE_FROM_SUB_PATH=true"] }

volumes: { mosq-data: {}, pg-data: {} }
```
> [!note] Squelette à ajuster
> cAdvisor demande parfois des droits supplémentaires sur le Pi ; on documente ce compromis dans la [[Matrice de sécurité]].

## Caddyfile
```
sentinel.lan, 192.168.10.1 {
  tls /certs/server.crt /certs/server.key
  encode gzip
  handle /api/*    { reverse_proxy api:8000 }
  handle /ws       { reverse_proxy api:8000 }
  handle /video*   { reverse_proxy vision:8081 }
  handle /grafana* { reverse_proxy grafana:3000 }
  handle { root * /srv
           try_files {path} /index.html
           file_server }
  header { Strict-Transport-Security "max-age=31536000"
           X-Content-Type-Options nosniff
           X-Frame-Options DENY
           -Server }
}
```

## `.env.example` (versionné, sans vraies valeurs)
```
POSTGRES_USER=sentinel_api
POSTGRES_PASSWORD=change-me
POSTGRES_DB=sentinel
MQTT_API_USER=api
MQTT_API_PASS=change-me
API_SERVICE_KEY=change-me
JWT_SECRET=change-me
DASH_ADMIN_USER=superviseur
DASH_ADMIN_PASS_HASH=change-me
GF_SECURITY_ADMIN_PASSWORD=change-me
```
