#!/usr/bin/env bash
#
# Log docker into ghcr.io using GHCR_USER + GHCR_TOKEN.
#
# Strips surrounding whitespace from both values: Cloud Agent secrets have
# previously been saved with a trailing space in the username, which makes an
# otherwise-valid credential look like a login failure.
#
#   scripts/cloud/ghcr-login.sh
#   pnpm cloud:build-worker-image
#
set -euo pipefail

die() { echo "GHCR_LOGIN_ABORT: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not available"

USER_RAW="${GHCR_USER:-${GHCR_USERNAME:-}}"
TOKEN_RAW="${GHCR_TOKEN:-}"

# Trim leading/trailing whitespace without printing the values.
USER="$(printf '%s' "$USER_RAW" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
TOKEN="$(printf '%s' "$TOKEN_RAW" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

[ -n "$USER" ] || die "GHCR_USER (or GHCR_USERNAME) is empty"
[ -n "$TOKEN" ] || die "GHCR_TOKEN is empty"

if [ "$USER" != "$USER_RAW" ] || [ "$TOKEN" != "$TOKEN_RAW" ]; then
  echo "GHCR_LOGIN: trimmed surrounding whitespace from credential env vars"
fi

echo "$TOKEN" | docker login ghcr.io -u "$USER" --password-stdin
echo "GHCR_LOGIN_OK user_len=${#USER} token_len=${#TOKEN}"
