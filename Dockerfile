# syntax=docker/dockerfile:1

# ── Web frontend build ────────────────────────────────────────────────────────
FROM node:22-alpine AS web-builder

WORKDIR /web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npm run build
RUN npx prisma generate

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist/
COPY --from=web-builder /web/dist ./web/dist/

EXPOSE 3000

# Default: API server. Override CMD in railway.toml for the worker service.
CMD ["node", "dist/index.js"]
