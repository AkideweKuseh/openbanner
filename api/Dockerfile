# syntax=docker/dockerfile:1

# ---------- deps: install node modules + download Chromium ----------
FROM node:24-bookworm-slim AS deps
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
WORKDIR /app
COPY package.json package-lock.json* ./
# unzip is required to extract the Chrome .zip that puppeteer's postinstall downloads;
# bookworm-slim does not ship it. ca-certificates is needed for the HTTPS download.
RUN apt-get update && apt-get install -y --no-install-recommends unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && (npm ci --omit=dev || npm install --omit=dev)

# ---------- runtime: minimal image with Chromium's shared libs ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    XDG_CONFIG_HOME=/tmp/.chromium \
    XDG_CACHE_HOME=/tmp/.chromium \
    HOME=/tmp

# Runtime shared libraries required by headless Chromium on Debian bookworm.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.cache ./.cache
COPY package.json ./
COPY src ./src

# Run as the unprivileged `node` user that ships with the base image.
RUN chown -R node:node /app

# Persistent template store. A named volume is mounted here at runtime; create the
# dir + hand ownership to `node` so the read-only container can write templates.
RUN mkdir -p /data/templates && chown -R node:node /data

USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
