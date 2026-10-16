FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Europe/Berlin \
    ORBIT_DOCKER=1 \
    TIKTOK_BROWSER_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

# Chromium is needed by the TikTok browser collectors and signature engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

COPY src/ ./src/
COPY public/ ./public/

# tiktok-signature patches its installed server script and writes a browser profile.
# Run as a non-root user, with writable runtime storage.
RUN mkdir -p /app/data /app/logs \
    && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=4 \
  CMD node -e "const http=require('http'); const r=http.get('http://127.0.0.1:3000/', x=>{x.resume();process.exit(x.statusCode<500?0:1)}); r.on('error',()=>process.exit(1)); r.setTimeout(3000,()=>{r.destroy();process.exit(1)})"

CMD ["node", "src/index.js"]
