#!/bin/sh
set -eu
umask 077
exec 9>/run/lock/best-certificate.lock
flock -n 9 || exit 0

docker run --rm \
  --mount type=bind,src=/home/deploy/best/ssl/letsencrypt,dst=/etc/letsencrypt \
  --mount type=bind,src=/home/deploy/best/ssl/work,dst=/var/lib/letsencrypt \
  --mount type=bind,src=/home/deploy/best/ssl/logs,dst=/var/log/letsencrypt \
  --mount type=bind,src=/home/deploy/gadgetly/gadgetly2-api/deploy/edge/sites/cavora-acme,dst=/var/www/certbot \
  certbot/certbot:v5.8.0 renew --cert-name bestlc-ip --non-interactive "$@"

# Label lookup is restricted to BEST. Reload even after an earlier failed reload.
best_nginx=$(docker ps --filter label=com.docker.compose.project=best-production --filter label=com.docker.compose.service=nginx --format '{{.ID}}')
if [ -n "$best_nginx" ]; then
  docker exec "$best_nginx" nginx -t
  docker exec "$best_nginx" nginx -s reload
fi
openssl x509 -checkend 86400 -noout \
  -in /home/deploy/best/ssl/letsencrypt/live/bestlc-ip/fullchain.pem
