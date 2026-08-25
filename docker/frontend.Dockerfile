# ---------------------------------------------------------------------------
# Frontend image — dev server behind the compose network.
# A production image would build to static assets and serve them from nginx;
# that arrives in Phase 9 along with the deployment target decision.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY shared ./shared
COPY frontend ./frontend

ENV VITE_API_PROXY_TARGET=http://backend:4000
EXPOSE 5175

CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host", "0.0.0.0"]
