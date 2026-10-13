#!/bin/sh
set -eu
umask 077
best_env=/home/deploy/best/.env
if [ "$(id -un)" != deploy ]; then
  echo "Run as deploy, not root." >&2
  exit 1
fi
if [ -e "$best_env" ]; then
  echo "$best_env already exists; leaving it unchanged." >&2
  exit 1
fi
command -v openssl >/dev/null
set -C
{
  printf 'BEST_RELEASE=initial\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'JWT_ACCESS_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'AUTH_OTP_HASH_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'S3_ACCESS_KEY_ID=best-production\n'
  printf 'S3_SECRET_ACCESS_KEY=%s\n' "$(openssl rand -hex 32)"
} > "$best_env"
echo "Created $best_env with mode 600. Do not paste its contents."
