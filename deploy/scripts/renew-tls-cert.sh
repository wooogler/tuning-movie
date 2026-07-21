#!/bin/bash
set -euo pipefail

DOMAIN=${CERTBOT_DOMAIN:?Set CERTBOT_DOMAIN to your deployment domain (e.g. example.edu)}
CERT_NAME=${CERTBOT_CERT_NAME:-$DOMAIN}
NGINX_CONTAINER=${NGINX_CONTAINER:-tuning-movie-nginx}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_DIR=${APP_DIR:-"$REPO_ROOT"}

CERTBOT_BASE=${CERTBOT_BASE:-"$APP_DIR/deploy/certbot/state"}
CERTBOT_CONFIG_DIR=${CERTBOT_CONFIG_DIR:-"$CERTBOT_BASE/config"}
CERTBOT_WORK_DIR=${CERTBOT_WORK_DIR:-"$CERTBOT_BASE/work"}
CERTBOT_LOGS_DIR=${CERTBOT_LOGS_DIR:-"$CERTBOT_BASE/logs"}
WEBROOT_DIR=${CERTBOT_WEBROOT_DIR:-"$APP_DIR/deploy/certbot/www"}
DEPLOY_SSL_DIR=${DEPLOY_SSL_DIR:-"$APP_DIR/deploy/ssl"}

mkdir -p "$CERTBOT_CONFIG_DIR" "$CERTBOT_WORK_DIR" "$CERTBOT_LOGS_DIR" "$WEBROOT_DIR" "$DEPLOY_SSL_DIR"

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot is required but was not found." >&2
  exit 1
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required but was not found." >&2
  exit 1
fi

if ! podman ps --format '{{.Names}}' | grep -qx "$NGINX_CONTAINER"; then
  echo "Container $NGINX_CONTAINER is not running. Start nginx before renewing." >&2
  exit 1
fi

CURRENT_FINGERPRINT=""
if [ -f "$DEPLOY_SSL_DIR/fullchain.pem" ]; then
  CURRENT_FINGERPRINT=$(openssl x509 -in "$DEPLOY_SSL_DIR/fullchain.pem" -noout -fingerprint -sha256 2>/dev/null || true)
fi

CERTBOT_ARGS=(
  certonly
  --webroot
  -w "$WEBROOT_DIR"
  --non-interactive
  --agree-tos
  --key-type ecdsa
  --cert-name "$CERT_NAME"
  -d "$DOMAIN"
  --keep-until-expiring
  --config-dir "$CERTBOT_CONFIG_DIR"
  --work-dir "$CERTBOT_WORK_DIR"
  --logs-dir "$CERTBOT_LOGS_DIR"
)

if [ ! -d "$CERTBOT_CONFIG_DIR/accounts" ]; then
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

certbot "${CERTBOT_ARGS[@]}"

NEW_CERT="$CERTBOT_CONFIG_DIR/live/$CERT_NAME/fullchain.pem"
NEW_KEY="$CERTBOT_CONFIG_DIR/live/$CERT_NAME/privkey.pem"

if [ ! -f "$NEW_CERT" ] || [ ! -f "$NEW_KEY" ]; then
  echo "Expected renewed certificate files were not created." >&2
  exit 1
fi

NEW_FINGERPRINT=$(openssl x509 -in "$NEW_CERT" -noout -fingerprint -sha256)

if [ "$NEW_FINGERPRINT" != "$CURRENT_FINGERPRINT" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)

  if [ -f "$DEPLOY_SSL_DIR/fullchain.pem" ]; then
    cp "$DEPLOY_SSL_DIR/fullchain.pem" "$DEPLOY_SSL_DIR/fullchain.pem.bak-$TIMESTAMP"
  fi

  if [ -f "$DEPLOY_SSL_DIR/privkey.pem" ]; then
    cp "$DEPLOY_SSL_DIR/privkey.pem" "$DEPLOY_SSL_DIR/privkey.pem.bak-$TIMESTAMP"
  fi

  cp "$NEW_CERT" "$DEPLOY_SSL_DIR/fullchain.pem"
  cp "$NEW_KEY" "$DEPLOY_SSL_DIR/privkey.pem"
  chmod 644 "$DEPLOY_SSL_DIR/fullchain.pem"
  chmod 600 "$DEPLOY_SSL_DIR/privkey.pem"

  podman restart "$NGINX_CONTAINER" >/dev/null
  echo "Deployed a renewed certificate and restarted $NGINX_CONTAINER."
else
  echo "Certificate is still current; no deployment change was needed."
fi

curl -fsSk --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/health" >/dev/null
echo "HTTPS health check succeeded."
