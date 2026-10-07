# 1. Build du dashboard React (Vite 8 → Node 22)
FROM node:22-alpine AS build
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# 2. Caddy sert le build et aiguille /api, /ws, /video
FROM caddy:2-alpine
COPY server/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
