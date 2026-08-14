#!/usr/bin/env bash
# Per-boot reconciliation: bring PostgreSQL online and keep the dev schema
# current. Tolerant of restarts and safe to run every time the environment
# starts. Dependency installation and seeding live in install.sh, not here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_MAJOR=16
DEV_DB="doodle_dash"
TEST_DB="doodle_dash_test"
DB_USER="doodle"
DB_PASSWORD="doodle"

echo "==> Starting PostgreSQL cluster"
if ! pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "$PG_MAJOR" main start || true
fi
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done
sudo -u postgres pg_isready

echo "==> Ensuring role and databases exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB; END IF; END \$\$;"
for db in "$DEV_DB" "$TEST_DB"; do
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    sudo -u postgres createdb -O "$DB_USER" "$db"
  fi
done

echo "==> Applying any pending migrations to the dev database"
if [ -f .env ] && [ -d node_modules ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  pnpm db:migrate || echo "WARN: migrate deploy skipped/failed; run pnpm db:migrate manually."
fi

echo "==> Start reconciliation complete."
