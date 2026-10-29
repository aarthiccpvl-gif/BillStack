#!/usr/bin/env bash
#
# Restore a database and storage pair produced by scripts/backup.sh.
#
#   RESTORE_CONFIRM=yes ./scripts/restore.sh backups/db-....sql.gz backups/storage-....tar.gz
#
# This stops the backend, restores both halves, and starts it again. Run it only
# during a maintenance window.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ $# -ne 2 ]]; then
  echo "Usage: RESTORE_CONFIRM=yes $0 <db.sql.gz> <storage.tar.gz>" >&2
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "yes" ]]; then
  echo "Refusing to restore without RESTORE_CONFIRM=yes." >&2
  echo "This overwrites the live database and storage." >&2
  exit 1
fi

DB_FILE="$1"
STORAGE_FILE="$2"

for file in "$DB_FILE" "$STORAGE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing backup file: $file" >&2
    exit 1
  fi
done

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not set in $ENV_FILE}"

echo "Stopping backend"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop backend

echo "Restoring database from $DB_FILE"
gunzip -c "$DB_FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot

echo "Restoring storage from $STORAGE_FILE"
cat "$STORAGE_FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  run --rm --no-deps backend tar xzf - -C /app/var/storage

echo "Starting backend"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start backend

echo "Restore complete. Check /api/health and open a known document."
