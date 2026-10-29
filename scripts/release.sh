#!/usr/bin/env bash
#
# Apply database migrations to the production stack.
#
#   ./scripts/release.sh
#
# Run this before starting a new backend image. It uses a one-off container so
# the migration is not raced by a second application instance.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and fill it in." >&2
  exit 1
fi

echo "Applying migrations with $COMPOSE_FILE ($ENV_FILE)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm backend \
  npx prisma migrate deploy --schema backend/prisma/schema.prisma

echo "Migrations applied."
