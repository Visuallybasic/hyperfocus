# ── Stage 1: build Vite frontend ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY --from=builder /app/dist ./dist

# SQLite data lives in a mounted volume at /data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/focus-five.db

CMD ["node", "server.js"]
