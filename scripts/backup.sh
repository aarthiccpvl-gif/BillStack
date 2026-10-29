#!/usr/bin/env bash
#
# Back up the database and the uploaded/rendered files.
#
#   ./scripts/backup.sh
#
# Produces two archives in ./backups (override with BACKUP_DIR):
#   db-YYYYmmdd-HHMMSS.sql.gz
#   storage-YYYYmmdd-HHMMSS.tar.gz
#
# Keep the archives off the host. A backup that only exists on the machine it
# backs up is not a backup.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not set in $ENV_FILE}"

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
STORAGE_FILE="$BACKUP_DIR/storage-$STAMP.tar.gz"

echo "Backing up database -> $DB_FILE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysqldump -uroot --single-transaction --routines --triggers --databases invoice_db \
  | gzip > "$DB_FILE"

echo "Backing up storage -> $STORAGE_FILE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  tar czf - -C /app/var/storage . > "$STORAGE_FILE"

echo "Removing archives older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -type f \( -name 'db-*.sql.gz' -o -name 'storage-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Done:"
ls -lh "$DB_FILE" "$STORAGE_FILE"
