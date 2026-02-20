#!/bin/bash
set -e

# TUNING-MOVIE Podman Deployment Script

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_DIR=${APP_DIR:-"/opt/tuning-movie"}
BACKUP_DIR=${BACKUP_DIR:-"/opt/tuning-movie-backups"}

echo -e "${GREEN}=== TUNING-MOVIE Podman Deploy ===${NC}"
echo "Application Directory: $APP_DIR"
echo ""

if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}Error: $APP_DIR does not exist${NC}"
  exit 1
fi

cd "$APP_DIR"

echo -e "${YELLOW}[1/8] Checking required environment file...${NC}"
if [ ! -f ".env" ]; then
  echo -e "${RED}Error: .env file is required but was not found in $APP_DIR${NC}"
  if [ -f ".env.example" ]; then
    echo "Create it first: cp .env.example .env"
  fi
  exit 1
fi

echo -e "${YELLOW}[2/8] Ensuring runtime directories...${NC}"
mkdir -p apps/backend/data
mkdir -p deploy/ssl

echo -e "${YELLOW}[3/8] Creating backup...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
if [ -d "apps/backend/data" ]; then
  tar -czf "$BACKUP_DIR/tuning-movie-backup-$TIMESTAMP.tar.gz" apps/backend/data 2>/dev/null || true
  echo "Backup created: $BACKUP_DIR/tuning-movie-backup-$TIMESTAMP.tar.gz"
fi

echo -e "${YELLOW}[4/8] Pulling latest code...${NC}"
if [ -d ".git" ]; then
  git pull --ff-only || git pull
else
  echo "Skipping git pull (not a git repository)"
fi

echo -e "${YELLOW}[5/8] Stopping old containers...${NC}"
podman-compose down || podman stop tuning-movie-backend tuning-movie-agent tuning-movie-nginx 2>/dev/null || true

echo -e "${YELLOW}[6/8] Building images...${NC}"
podman-compose build

echo -e "${YELLOW}[7/8] Starting containers...${NC}"
podman-compose up -d

echo -e "${YELLOW}[8/8] Verifying deployment...${NC}"
sleep 5

if podman ps --format '{{.Names}}' | grep -q '^tuning-movie-backend$' && \
   podman ps --format '{{.Names}}' | grep -q '^tuning-movie-agent$' && \
   podman ps --format '{{.Names}}' | grep -q '^tuning-movie-nginx$'; then
  echo -e "${GREEN}Containers are running.${NC}"
else
  echo -e "${RED}Deployment failed: container not running.${NC}"
  echo "Check logs:"
  echo "  podman logs tuning-movie-backend"
  echo "  podman logs tuning-movie-agent"
  echo "  podman logs tuning-movie-nginx"
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  if curl -fsS http://127.0.0.1/health >/dev/null; then
    echo -e "${GREEN}Health check passed.${NC}"
  else
    echo -e "${RED}Health check failed (http://127.0.0.1/health).${NC}"
    exit 1
  fi

  if curl -fsS http://127.0.0.1/monitor-api/health >/dev/null; then
    echo -e "${GREEN}Monitor API check passed.${NC}"
  else
    echo -e "${RED}Monitor API check failed (http://127.0.0.1/monitor-api/health).${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo "Useful commands:"
echo "  podman logs -f tuning-movie-backend"
echo "  podman logs -f tuning-movie-agent"
echo "  podman logs -f tuning-movie-nginx"
echo "  podman-compose down"
