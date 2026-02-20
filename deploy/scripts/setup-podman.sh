#!/bin/bash
set -e

# TUNING-MOVIE Podman Setup Script for Rocky Linux

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOY_USER=${DEPLOY_USER:-"$USER"}
APP_DIR=${APP_DIR:-"/opt/tuning-movie"}

echo -e "${GREEN}=== TUNING-MOVIE Podman Setup ===${NC}"
echo -e "${YELLOW}Deploy User:${NC} $DEPLOY_USER"
echo -e "${YELLOW}App Directory:${NC} $APP_DIR"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)."
  exit 1
fi

echo -e "${GREEN}[1/7] Updating system packages...${NC}"
dnf update -y

echo -e "${GREEN}[2/7] Installing base packages...${NC}"
dnf install -y epel-release
dnf install -y git curl wget vim htop

echo -e "${GREEN}[3/7] Installing Podman stack...${NC}"
dnf install -y podman podman-compose podman-plugins
podman --version
podman-compose --version || true

echo -e "${GREEN}[4/7] Configuring rootless UID/GID mappings...${NC}"
if ! grep -q "^${DEPLOY_USER}:" /etc/subuid 2>/dev/null; then
  usermod --add-subuids 100000-165535 "$DEPLOY_USER"
fi
if ! grep -q "^${DEPLOY_USER}:" /etc/subgid 2>/dev/null; then
  usermod --add-subgids 100000-165535 "$DEPLOY_USER"
fi

echo -e "${GREEN}[5/7] Configuring firewall...${NC}"
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
fi

echo -e "${GREEN}[6/7] Configuring SELinux for containers...${NC}"
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
  setsebool -P container_manage_cgroup on
  setsebool -P httpd_can_network_connect on
fi

echo -e "${GREEN}[7/7] Preparing app directories...${NC}"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/apps/backend/data"
mkdir -p "$APP_DIR/deploy/ssl"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo ""
echo -e "${GREEN}Setup complete.${NC}"
echo "Next:"
echo "1) Copy repository to $APP_DIR"
echo "2) cd $APP_DIR && podman-compose build"
echo "3) podman-compose up -d"
