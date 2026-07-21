# TUNING-MOVIE Deployment Guide (Podman + Nginx)

`npm run dev` currently starts this stack:
- backend (Fastify + SQLite + main frontend runtime)
- agent (`apps/tuning-agent`)
- monitor UI (`apps/agent-monitor`)

Production deployment in this repo maps that to:
- `tuning-movie-backend`
- `tuning-movie-agent`
- `tuning-movie-nginx`

`nginx` exposes public URL and routes:
- `/` -> backend app
- `/agent/ws` -> backend relay websocket
- `/agent-monitor/` -> monitor web UI
- `/monitor-api/*` -> agent monitor API (`apps/tuning-agent` monitor server)

## 1) One-time server setup

```bash
cd /opt/tuning-movie
sudo bash deploy/scripts/setup-podman.sh
```

## 2) App install/update

```bash
cd /opt
git clone https://github.com/wooogler/tuning-movie.git
cd tuning-movie
```

## 3) Build and run

```bash
cd /opt/tuning-movie
podman-compose build
podman-compose up -d
```

## 4) Verify

```bash
podman ps
curl -f http://127.0.0.1/health
curl -f http://127.0.0.1/monitor-api/health
```

Expected containers:
- `tuning-movie-backend`
- `tuning-movie-agent`
- `tuning-movie-nginx`

## 5) Access URLs

- Main app: `http://<server-host>/`
- Agent monitor: `http://127.0.0.1/agent-monitor/` (localhost only by default)

`/agent-monitor/*` and `/monitor-api/*` are intentionally restricted to localhost in nginx.
If you must expose monitor externally, edit `deploy/nginx/conf.d/tuning-movie.conf` and remove the `allow/deny` rules.

## 6) Deploy updates (after code changes)

```bash
cd /opt/tuning-movie
bash deploy/scripts/deploy-podman.sh
```

This script:
1. backs up `apps/backend/data`
2. pulls latest code
3. rebuilds containers
4. restarts services
5. checks `/health` and `/monitor-api/health`

## 7) SQLite persistence

SQLite file path in container:
- `/app/apps/backend/data/tuning-movie.db`

Host persistence path:
- `/opt/tuning-movie/apps/backend/data`

Study/runtime log persistence paths on host:
- `/opt/tuning-movie/logs/interaction`
- `/opt/tuning-movie/logs/trace`
- `/opt/tuning-movie/logs/survey`

## 8) TLS (optional)

By default, `deploy/nginx/conf.d/tuning-movie.conf` serves HTTP on port 80.

To enable HTTPS:
1. Put cert files in `deploy/ssl/fullchain.pem` and `deploy/ssl/privkey.pem`
2. Uncomment/configure the TLS server block in `deploy/nginx/conf.d/tuning-movie.conf`
3. Restart nginx container

```bash
podman restart tuning-movie-nginx
```

## 8.1) Automatic TLS renewal

The repository includes a no-downtime renewal flow for your domain (set `CERTBOT_DOMAIN`):

1. `nginx` serves `/.well-known/acme-challenge/` from `deploy/certbot/www`
2. `deploy/scripts/renew-tls-cert.sh` asks Let's Encrypt for a renewed cert with `certbot --webroot`
3. If the cert changed, the script replaces `deploy/ssl/fullchain.pem` and `deploy/ssl/privkey.pem`
4. The script restarts `tuning-movie-nginx`

To install the renewal cron job for the current user:

```bash
./deploy/scripts/install-cert-renew-cron.sh
```

The installed cron job runs at `03:23` and `15:23` every day and writes to:

```bash
deploy/certbot/logs/renew-cron.log
```

You can also run the renewal manually:

```bash
./deploy/scripts/renew-tls-cert.sh
```

## 9) Logs and troubleshooting

```bash
podman logs tuning-movie-backend
podman logs tuning-movie-agent
podman logs tuning-movie-nginx
find logs -maxdepth 2 -type f | sort
podman-compose ps
podman-compose down
podman-compose up -d
```

If `podman-compose build` fails with:
`potentially insufficient UIDs or GIDs available in user namespace`

Run setup again as root (it configures `/etc/subuid` and `/etc/subgid` for the deploy user):

```bash
sudo bash deploy/scripts/setup-podman.sh
```

Security checklist:
- Use non-172 Docker/Podman subnet (this repo pins `10.1.24.0/24` in `docker-compose.yml`)
- Avoid exposing DB/admin ports externally (this repo only publishes 80/443)

If you changed network settings and need to recreate the compose network:

```bash
podman network rm tuning-movie-network
podman-compose up -d
```
