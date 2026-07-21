#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_DIR=${APP_DIR:-"$REPO_ROOT"}

# renew-tls-cert.sh requires CERTBOT_DOMAIN, so bake it into the cron entry.
CERTBOT_DOMAIN=${CERTBOT_DOMAIN:?Set CERTBOT_DOMAIN to your deployment domain (e.g. example.edu)}

CERTBOT_BASE=${CERTBOT_BASE:-"$APP_DIR/deploy/certbot/state"}
CERTBOT_CONFIG_DIR=${CERTBOT_CONFIG_DIR:-"$CERTBOT_BASE/config"}
CERTBOT_WORK_DIR=${CERTBOT_WORK_DIR:-"$CERTBOT_BASE/work"}
CERTBOT_LOGS_DIR=${CERTBOT_LOGS_DIR:-"$CERTBOT_BASE/logs"}
WEBROOT_DIR=${CERTBOT_WEBROOT_DIR:-"$APP_DIR/deploy/certbot/www"}
CRON_LOG_DIR=${CRON_LOG_DIR:-"$APP_DIR/deploy/certbot/logs"}

mkdir -p "$CERTBOT_CONFIG_DIR" "$CERTBOT_WORK_DIR" "$CERTBOT_LOGS_DIR" "$WEBROOT_DIR" "$CRON_LOG_DIR"

if [ -d /tmp/tuning-certbot/config ] && [ ! -d "$CERTBOT_CONFIG_DIR/live" ]; then
  cp -a /tmp/tuning-certbot/config/. "$CERTBOT_CONFIG_DIR/"
fi

ENTRY="23 3,15 * * * cd $APP_DIR && CERTBOT_DOMAIN=$CERTBOT_DOMAIN $APP_DIR/deploy/scripts/renew-tls-cert.sh >> $CRON_LOG_DIR/renew-cron.log 2>&1 # tuning-movie-cert-renew"
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

if crontab -l >"$TMPFILE" 2>/dev/null; then
  grep -v 'tuning-movie-cert-renew' "$TMPFILE" >"$TMPFILE.filtered" || true
  mv "$TMPFILE.filtered" "$TMPFILE"
fi

printf '%s\n' "$ENTRY" >>"$TMPFILE"
crontab "$TMPFILE"

echo "Installed cron entry:"
echo "$ENTRY"
