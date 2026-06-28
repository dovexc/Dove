# Hetzner deployment

One-time setup on a fresh Hetzner Cloud VPS (CPX21/22, Ubuntu).

## 1. Server basics
```bash
apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
adduser --system --group dove
mkdir -p /opt/dove/server/data
```
In the Hetzner Cloud console: attach a **Cloud Firewall** allowing only 22 (SSH, ideally restricted to your IP), 80, 443 inbound. Postgres (5432) must NOT be reachable from outside — `docker-compose.postgres.yml` already binds it to `127.0.0.1` only.

## 2. Postgres
```bash
cp deploy/docker-compose.postgres.yml /opt/dove/
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" > /opt/dove/.env
cd /opt/dove && docker compose -f docker-compose.postgres.yml up -d
```

## 3. Backend binary
Build for the target (either directly on the VPS, or cross-compile and `scp`):
```bash
cd server && cargo build --release
scp target/release/dove-server root@<vps-ip>:/opt/dove/server/
```
The `migrations/` folder must also be present alongside the binary (sqlx::migrate! reads it at startup) — copy `server/migrations/` to `/opt/dove/server/migrations/` too.

## 4. Config + service
```bash
cp deploy/.env.example /opt/dove/server/.env
# edit /opt/dove/server/.env — set DATABASE_URL (matching the password from step 2),
# DOVE_JWT_SECRET (openssl rand -base64 32), DOVE_ADMIN_EMAILS
chown -R dove:dove /opt/dove/server
cp deploy/dove-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dove-server
journalctl -u dove-server -f   # confirm it's listening on :4000
```

## 5. Nginx + TLS
```bash
cp deploy/nginx-dove.conf /etc/nginx/sites-available/dove
# edit server_name to your real domain
ln -s /etc/nginx/sites-available/dove /etc/nginx/sites-enabled/
certbot --nginx -d api.dove.example
systemctl reload nginx
```
Point the domain's DNS at the VPS through Cloudflare (proxied, for DDoS protection/CDN per the existing infra plan).

## 6. Point the client at production
`.env.production` (repo root) already sets `VITE_API_BASE` for the frontend —
Vite picks it up automatically on any `npm run build`/`tauri build`. Cargo
doesn't read `.env` files for `option_env!`, so the Rust side still needs the
matching var passed on the command line:
```bash
DOVE_API_BASE=https://api.dovexc.com npm run tauri build
```

## Redeploying after a code change
Push to `main` — `.github/workflows/deploy-server.yml` tests against a
Postgres service container, builds the release binary, and deploys it to
the VPS automatically. For a one-off manual deploy:
```bash
cd server && cargo build --release
scp target/release/dove-server root@<vps-ip>:/opt/dove/server/dove-server.new
ssh root@<vps-ip> '
  systemctl stop dove-server
  mv /opt/dove/server/dove-server.new /opt/dove/server/dove-server
  systemctl start dove-server
'
```

## Backups
`dove-backup.timer` runs daily at 03:30 UTC, dumping Postgres
(`docker exec dove-postgres-1 pg_dump`) and uploading it gzip-compressed to
the **private** `dove-backups` R2 bucket (`postgres/` prefix) — never the
public `dove-assets` bucket, which is served at `cdn.dovexc.com`. A bucket
lifecycle rule expires backups after 30 days.

Setup on a fresh VPS:
```bash
apt-get install -y awscli
cp deploy/backup.sh /opt/dove/backup.sh && chmod +x /opt/dove/backup.sh
cp deploy/dove-backup.service /etc/systemd/system/
cp deploy/dove-backup.timer /etc/systemd/system/
# /opt/dove/backup.env needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# (same R2 token as DOVE_R2_ACCESS_KEY_ID/SECRET in server/.env, just
# renamed to what awscli expects) and DOVE_R2_ACCOUNT_ID.
systemctl daemon-reload
systemctl enable --now dove-backup.timer
```

Restore: `gunzip -c dove-backup-<ts>.sql.gz | docker exec -i dove-postgres-1 psql -U dove dove`
