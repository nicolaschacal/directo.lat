#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/escucha_$STAMP.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-escucha}" "${POSTGRES_DB:-escucha}" | gzip > "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -type f -name 'escucha_*.sql.gz' -mtime +30 -delete

echo "Backup creado: $FILE"
