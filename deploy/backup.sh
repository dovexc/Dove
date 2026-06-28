#!/bin/bash
# Dumps the dove-postgres-1 container's database, compresses it, and uploads
# it to the *private* dove-backups R2 bucket (never the public dove-assets
# bucket — a DB dump must never be reachable via cdn.dovexc.com).
set -euo pipefail

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="/tmp/dove-backup-${TIMESTAMP}.sql.gz"

docker exec dove-postgres-1 pg_dump -U dove dove | gzip > "$DUMP_FILE"

aws s3 cp "$DUMP_FILE" "s3://dove-backups/postgres/dove-backup-${TIMESTAMP}.sql.gz" \
  --endpoint-url "https://${DOVE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

rm -f "$DUMP_FILE"
echo "Backup uploaded: dove-backup-${TIMESTAMP}.sql.gz"
