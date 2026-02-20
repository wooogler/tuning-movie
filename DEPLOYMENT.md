# TUNING-MOVIE Deployment Guide (Podman + Nginx)

`npm run dev` currently starts this stack:
- backend (Fastify + SQLite + main frontend runtime)
- agent (`apps/tuning-agent-typescript`)
- monitor UI (`apps/agent-monitor`)

Production deployment in this repo maps that to:
- `tuning-movie-backend`
- `tuning-movie-agent`
- `tuning-movie-nginx`

`nginx` exposes public URL and routes:
- `/` -> backend app
- `/agent/ws` -> backend relay websocket
- `/agent-monitor/` -> monitor web UI
- `/monitor-api/*` -> agent monitor API (`apps/tuning-agent-typescript` monitor server)

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

## 8) TLS (optional)

By default, `deploy/nginx/conf.d/tuning-movie.conf` serves HTTP on port 80.

To enable HTTPS:
1. Put cert files in `deploy/ssl/fullchain.pem` and `deploy/ssl/privkey.pem`
2. Uncomment/configure the TLS server block in `deploy/nginx/conf.d/tuning-movie.conf`
3. Restart nginx container

```bash
podman restart tuning-movie-nginx
```

## 9) Logs and troubleshooting

```bash
podman logs tuning-movie-backend
podman logs tuning-movie-agent
podman logs tuning-movie-nginx
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

Security checklist from VT wiki:
- Use non-172 Docker/Podman subnet (this repo pins `10.1.24.0/24` in `docker-compose.yml`)
- Avoid exposing DB/admin ports externally (this repo only publishes 80/443)

If you changed network settings and need to recreate the compose network:

```bash
podman network rm tuning-movie-network
podman-compose up -d
```
