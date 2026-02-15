#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV_FILE="$ROOT_DIR/.env"
MODE="${1:-dev}"

if [[ -f "$ROOT_ENV_FILE" ]]; then
  # Export every variable declared in repo-root .env for the child process.
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_ENV_FILE"
  set +a
  echo "[tuning-agent-typescript] Loaded env from $ROOT_ENV_FILE"
else
  echo "[tuning-agent-typescript] .env not found at $ROOT_ENV_FILE (using current shell env)"
fi

cd "$ROOT_DIR"
if [[ "$MODE" == "start" ]]; then
  exec npm run start --workspace=apps/tuning-agent-typescript
fi

exec npm run dev --workspace=apps/tuning-agent-typescript
