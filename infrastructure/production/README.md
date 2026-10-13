# BEST production on the existing VPS

This is a staged runbook, not an instruction to run every block at once.
The operator runs commands on the VPS and reviews each result before proceeding.

## Boundaries and layout

- Sibling repositories: /home/deploy/best/best-server and best-react, release branch master.
- Dedicated GitHub read-only deploy keys remain configured per repository.
- Public BEST URL: https://201.18.217.140:3102; dedicated BEST Nginx terminates TLS.
- API: 127.0.0.1:3103 only. PostgreSQL, Redis, SeaweedFS, ClamAV, web and workers have no other published ports.
- Docker project best-production owns its own volumes and default network. Only Nginx also joins existing edge.
- No shared Caddy configuration changes or restarts. No Cavora/Gadgetly container operations.
- Independent certificate: /home/deploy/best/ssl/letsencrypt/live/bestlc-ip.
- Renewal temporarily uses the already approved HTTP challenge webroot under Gadgetly's cavora-acme directory.
  Before relocating Cavora later, update and dry-run BEST renewal against the new challenge route.
- Cookies have BEST-specific names because browser cookies are shared across ports.
  Different ports on one IP are not a security boundary against another compromised application on that IP.
- No public signup. Admin-provisioned password login is enabled; email-code verification is deferred.
- Production rejects reserved example/test email addresses. Confirm an existing Admin has a usable real email before launch.
- .env, keys, dumps, and certificate directories stay outside Git and Docker build contexts.

## 1. Repository and environment preparation (deploy user)

After reviewing and pushing the deployment commits to master:

```sh
cd /home/deploy/best
git -C best-server status -sb
git -C best-react status -sb
git -C best-server pull --ff-only origin master
git -C best-react pull --ff-only origin master
cd best-server
sh infrastructure/production/create-env.sh
docker network inspect edge --format '{{.Name}}'
docker compose --env-file ../.env -f compose.production.yml config --quiet
```

The environment script refuses to overwrite a file. Never print expanded Compose
configuration: it contains secrets. Retain each deployed Git SHA and image tag.
Use a unique BEST_RELEASE in ../.env for later releases and retain the previous images.

All following Compose commands run from /home/deploy/best/best-server.

## 2. Certificate renewal (root, install only BEST units)

```sh
install -o root -g root -m 755 /home/deploy/best/best-server/infrastructure/production/renew-certificate.sh /usr/local/sbin/best-renew-certificate
install -o root -g root -m 644 /home/deploy/best/best-server/infrastructure/production/best-certificate.service /etc/systemd/system/best-certificate.service
install -o root -g root -m 644 /home/deploy/best/best-server/infrastructure/production/best-certificate.timer /etc/systemd/system/best-certificate.timer
/usr/local/sbin/best-renew-certificate --dry-run
systemctl daemon-reload
systemctl enable --now best-certificate.timer
systemctl start best-certificate.service
systemctl status best-certificate.timer --no-pager
journalctl -u best-certificate.service -n 30 --no-pager
```

The script takes an exclusive lock, renews only bestlc-ip, validates/reloads only
the container labelled best-production/nginx, and fails if less than one day remains.
Monitor this unit and the public certificate expiry. A timer without failure monitoring
is not a complete production alerting system. Nginx need not exist when installing the timer.

## 3. Database transfer and restore

Existing local custom dump: D:\\projects\\best\\deploy-backups\\best-21070-20945.dump.
It was validated with pg_restore --list. Transfer over SSH into a mode-700 directory
under /home/deploy/best/backups, then compare SHA-256 hashes at both ends.
Do not print its contents or commit it.

Create only the new BEST PostgreSQL service:

```sh
docker compose --env-file ../.env -f compose.production.yml up -d --wait postgres
docker compose --env-file ../.env -f compose.production.yml exec -T postgres psql -U best -d best -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
```

The table count must be zero before the initial import. Stop for review if nonzero.
After transfer/hash verification, restore only into that empty BEST database:

```sh
docker compose --env-file ../.env -f compose.production.yml exec -T postgres pg_restore -U best -d best --no-owner --no-acl --exit-on-error --single-transaction < ../backups/best-21070-20945.dump
```

Do not use --clean, db push, reset, down -v, or global Docker prune.
Keep the original local database intact. A later restore or destructive migration
requires a fresh backup and explicit owner approval.

## 4. Media before launch

PostgreSQL contains media metadata, not object bytes. Copy the existing private
SeaweedFS objects with their exact bucket/key names and verify counts/sizes before
calling the deployment complete. Prefer authenticated S3 copy; a filesystem snapshot
requires stopping only the local BEST object store, with explicit permission first.
Do not copy local storage credentials into production. Do not copy an entire
SeaweedFS credential/config volume blindly into the new credential configuration.
No Redis queue migration is required for a settled development dataset; inspect
unfinished attempts/outbox jobs before enabling the scoring worker.

## 5. Backend checks, migrations and startup (deploy)

```sh
docker compose --env-file ../.env -f compose.production.yml build api migrate
docker compose --env-file ../.env -f compose.production.yml run --rm migrate yarn database:migrate:status
```

Review pending migrations against the restored database; only then:

```sh
docker compose --env-file ../.env -f compose.production.yml run --rm migrate
docker compose --env-file ../.env -f compose.production.yml up -d --wait api
curl --fail-with-body http://127.0.0.1:3103/graphql -H 'Content-Type: application/json' --data '{"query":"{ publicFaq(language: EN) { id } }"}'
```

The backend build runs build, typecheck, lint and unit tests. API health verifies
GraphQL plus a real database read; it does not certify worker/media correctness.
ClamAV's first signature download may take several minutes. Monitor available RAM
and disk; build sequentially on this shared VPS. Import-worker is a manual local
import tool, so it is not started as a daemon.

## 6. Frontend and HTTPS (deploy)

```sh
docker compose --env-file ../.env -f compose.production.yml build web
docker compose --env-file ../.env -f compose.production.yml up -d --wait web nginx
docker compose --env-file ../.env -f compose.production.yml exec -T nginx nginx -t
curl --fail --head https://201.18.217.140:3102/en
docker compose --env-file ../.env -f compose.production.yml ps
```

The Linux host-network build reads public content from the already restored, healthy
API via loopback 3103. This preserves static rendering and ISR. Build arguments contain
only public endpoints; never provide secrets through ARG. Browser GraphQL is intercepted
by Nginx, so it never uses the loopback rewrite baked into Next's standalone build.
Runtime server reads use api:4000. No wildcard CORS is necessary.

After reviewing pending outbox work:

```sh
docker compose --env-file ../.env -f compose.production.yml up -d scoring-worker
docker compose --env-file ../.env -f compose.production.yml logs --tail 40 scoring-worker
```

## 7. Launch checks and rollback

Check on the public HTTPS URL from another computer, without curl -k:

- Public pages in uz/ru/en and real API data.
- Login: invalid email, wrong password, role mismatch, valid Admin/Teacher/Student,
  protected routes, refresh and logout. No public signup exists.
- BEST cookies: Secure, HttpOnly, SameSite=Lax, correct unique names, no foreign cookie collision.
- Browser Network: same-origin GraphQL and signed media URLs; no internal hostname leakage.
- Foreign Origin POST rejected; anonymous protected reads rejected; unsigned private media denied.
- Signed upload/download with a fictional test object, malware verification, an existing migrated
  image/audio/PDF. Do not log or share signed URLs.
- Scoring worker processes a fictional authorized test and records its final status.
- Every relevant container is healthy/running; no restart loops; RAM/disk adequate.
- Renewal dry-run and timer next-run date; public certificate expiry.
- Existing Cavora/Gadgetly URLs remain healthy.

Keep logs free of passwords, tokens and private data. Nginx access logs omit query
strings; its error log is disabled because upstream errors may include signed URLs.
Use container health, access status, application logs, nginx -t and synthetic checks.

Before future changes, create and validate a PostgreSQL custom dump and a matching
object backup, and retain a protected off-VPS copy. Automate retention only after
the owner selects the destination and retention period. Backups/alerts and media
migration remain launch requirements; these files alone do not prove readiness.

For application rollback, restore the previous BEST_RELEASE and use retained images
with Compose up --no-build for only api, scoring-worker, web and nginx. Do not revert
database migrations automatically or restore over live data. Forward-compatible
schema changes are required for safe image rollback; otherwise stop for review.
