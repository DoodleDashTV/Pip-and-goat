#!/usr/bin/env bash
# Idempotent repository bootstrap for the Doodle Dash TV Studio monorepo.
# Safe to run repeatedly and against a partially prepared/cached state.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_MAJOR=16
DEV_DB="doodle_dash"
TEST_DB="doodle_dash_test"
DB_USER="doodle"
DB_PASSWORD="doodle"

echo "==> [1/6] Ensure PostgreSQL is installed"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client
fi

echo "==> [2/6] Ensure PostgreSQL cluster is running"
if ! pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "$PG_MAJOR" main start || true
fi
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> [3/6] Ensure database role and databases exist"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB; END IF; END \$\$;"
for db in "$DEV_DB" "$TEST_DB"; do
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    sudo -u postgres createdb -O "$DB_USER" "$db"
  fi
done

echo "==> [4/6] Ensure .env exists and is visible to Next.js and Prisma"
# The monorepo root .env is the single source of truth. Next.js (apps/web) and
# the Prisma CLI (packages/database) each look for a .env in their own package
# directory, so link the root file into both (both match the gitignored .env rule).
[ -f .env ] || cp .env.example .env
ln -sf ../../.env apps/web/.env
ln -sf ../../.env packages/database/.env

echo "==> [5/6] Install workspace dependencies (pnpm)"
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile

echo "==> [6/6] Generate Prisma client, apply migrations, and seed"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
pnpm db:generate
pnpm db:migrate
pnpm db:seed
# Keep the dedicated test database schema current (test suites reset/seed it).
DATABASE_URL="${DATABASE_URL/${DEV_DB}/${TEST_DB}}" \
  pnpm --filter @doodle-dash/database exec prisma migrate deploy

echo "==> Install complete."
