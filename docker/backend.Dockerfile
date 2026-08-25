# ---------------------------------------------------------------------------
# Backend image.
#
# The Chromium dependencies are installed now rather than in Phase 4, because
# "the PDF renders on my machine but not in the container" is a font/library
# problem and it is cheaper to have the base image right from the start.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/usr/local/bin \
    PUPPETEER_SKIP_DOWNLOAD=false \
    NODE_ENV=development

# Chromium runtime libraries + fonts. Liberation and DejaVu cover the metric
# fallbacks; the document templates themselves embed their own webfonts so the
# PDF is identical on Windows and Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      fonts-dejavu-core \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      openssl \
      wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- dependencies (cached separately from source) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspaces --include-workspace-root

# ---- build ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend

RUN npm run build -w shared \
    && npm run prisma:generate --if-present \
    && npm run build -w backend

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend ./backend
COPY package.json ./

RUN mkdir -p /app/var/storage && chown -R node:node /app/var
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1

CMD ["node", "backend/dist/server.js"]
