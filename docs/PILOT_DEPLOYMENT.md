# Elegant Solution — Single-host Pilot Deployment

This runbook describes the supported pilot path for an Ubuntu Server 22.04 or
24.04 x86-64 host with Docker Engine and the Docker Compose plugin. It uses
CPU-only Face AI and keeps PostgreSQL and Face AI private to Docker networking.

The pilot path is the root `ai-service/` directory. The older
`web/ai-service/` copy is not used by `docker-compose.pilot.yml`.

## Architecture

```text
Internet
  -> host Nginx/Caddy with HTTPS
  -> 127.0.0.1:3000
  -> Web container
       -> postgres:5432 on the private Compose network
       -> face-ai:8000 on the private Compose network
```

The Web uses the existing `AI_SERVICE_URL` variable, set internally to
`http://face-ai:8000`. The browser never receives or calls that private URL.
PostgreSQL and Face AI have no published host ports.

## 1. Prerequisites and domain

Prepare an x86-64 Ubuntu 22.04/24.04 server with:

- Docker Engine and the Docker Compose plugin;
- DNS A/AAAA record for the pilot domain pointing to the server;
- firewall access to TCP 80 and 443 only;
- enough CPU, RAM, and disk for PostgreSQL plus the CPU-only InsightFace image.

Do not commit certificates, private keys, or `.env.pilot` to the repository.

Clone or copy this repository to the server, then work from its root.

## 2. Configure secrets and deployment values

```bash
cp .env.pilot.example .env.pilot
openssl rand -hex 32
```

Replace every placeholder in `.env.pilot`. Use a long URL-safe value for
`POSTGRES_PASSWORD`, because Compose derives the internal `DATABASE_URL` from
it. Generate a separate value for `AUTH_SECRET`. Set `AUTH_URL` to the real
HTTPS pilot URL and keep `TZ=Asia/Bangkok` unless the business timezone is
deliberately changed.

Review the resolved Compose configuration without starting anything:

```bash
docker compose --env-file .env.pilot -f docker-compose.pilot.yml config --quiet
```

## 3. Build and start

Build the images and start the pilot:

```bash
docker compose --env-file .env.pilot -f docker-compose.pilot.yml build
docker compose --env-file .env.pilot -f docker-compose.pilot.yml up -d
```

The Face AI image runs:

```text
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info
```

InsightFace `buffalo_l` uses the CPU execution provider. The image build
prepares the model under `/opt/insightface`; the model is not stored in Git.
The first image build downloads/prepares the model and can take several
minutes. Restarts and container recreation using the same image do not require
a manual download. Building a new AI image repeats the preparation step.
Review the upstream InsightFace model licensing before the company pilot.

The Web waits for PostgreSQL readiness, then runs:

```text
prisma migrate deploy --config ./prisma.runtime.config.ts
```

Only after migrations succeed does it start the standalone Next.js server. A migration failure
stops the Web container and is visible in its logs; the schema is never changed
with `db push`, `migrate dev`, or `--accept-data-loss` on this path.

All long-running services use `restart: unless-stopped`. Face AI may still be
loading when Web starts; this is intentional. Diagnostics reports Face AI as
unavailable/degraded until its model-aware healthcheck is ready.

## 4. HTTPS reverse proxy

Compose binds Web to `127.0.0.1:3000`, not to a public interface. Terminate
HTTPS at a host-level Nginx/Caddy installation and proxy only to that loopback
port. An Nginx example is at
[`deploy/nginx/pilot.conf.example`](../deploy/nginx/pilot.conf.example).

Provision certificates through the host's normal Let's Encrypt or managed
certificate process. Do not put certificate material in this repository. Do
not proxy `/ai/`; Face AI must remain private.

Face Gate camera access must be tested through the real HTTPS domain (or
localhost during local development), not through the private AI service.

## 5. Verification

Run the non-destructive pilot check:

```bash
chmod +x scripts/pilot-check.sh
./scripts/pilot-check.sh
```

It checks running Compose services, Web liveness, PostgreSQL readiness, and
Face AI model readiness. It does not write database rows, enroll faces, delete
faces, expose credentials, or repair services.

Then open `/admin/diagnostics` through the HTTPS domain and confirm:

- Web Application: Healthy;
- Database: Healthy;
- Face AI: Healthy with API reachable and model loaded;
- Agent fleet state is expected for the machines being installed.

The public liveness endpoint is intentionally minimal:
`GET /api/liveness` returns only `{ "status": "ok" }`.

## 6. Backups

Take a backup before the on-site pilot and after the pilot:

```bash
set -a
. ./.env.pilot
set +a
mkdir -p backups
docker compose --env-file .env.pilot -f docker-compose.pilot.yml \
  exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "backups/elegant-pilot-$(date +%Y%m%d-%H%M%S).dump"
```

PostgreSQL data persists in the named `pilot_postgres_data` volume. Do not use
`docker compose down -v` during normal stop/restart operations.

Emergency restore requires explicit operator approval. First stop Web and take
a copy of the current database backup. Then restore the approved dump:

```bash
set -a
. ./.env.pilot
set +a
docker compose --env-file .env.pilot -f docker-compose.pilot.yml stop web
docker compose --env-file .env.pilot -f docker-compose.pilot.yml \
  exec -T postgres pg_restore --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backups/APPROVED_BACKUP.dump
docker compose --env-file .env.pilot -f docker-compose.pilot.yml start web
```

The restore command is intentionally not automated. Never improvise a
destructive migration rollback; restore a known-compatible backup when a
previous application version cannot read the forward schema.

## 7. Rollback and safe stop

For an application rollback, stop the pilot without removing its data:

```bash
docker compose --env-file .env.pilot -f docker-compose.pilot.yml stop
```

Run the previously approved application/AI image or checkout, then start the
same Compose project again. Database migrations are forward-only on the pilot
path. Confirm that the previous application version is compatible with every
migration already applied; otherwise use the approved database restore
procedure. Do not delete migration history or run `prisma migrate reset`.

To remove containers while retaining PostgreSQL data, use `docker compose down`
without `-v`. Removing the named volume is an explicit data-destruction action
and is outside this runbook.

## 8. Reboot validation

Perform this on the actual VPS, not only in local tests:

1. Confirm `/admin/diagnostics` shows Web, Database, and Face AI healthy.
2. Enroll a real pilot test account through the existing UI.
3. Verify that its `FaceProfile` is stored and that Gate verification succeeds.
4. Reboot the VPS.
5. Wait for Docker and the services to restart.
6. Run `./scripts/pilot-check.sh`.
7. Open `/admin/diagnostics` and confirm Web Healthy, Database Healthy, and Face AI Ready.
8. Verify the same enrolled user again without re-enrollment.

This proves that no manual Uvicorn/AI startup command is required after reboot.

## 9. Face enroll/verify smoke test

Use a real, approved pilot test account and real camera images:

1. Open the HTTPS application and enroll the account's face.
2. Confirm enrollment succeeds and a `FaceProfile` exists.
3. Open the existing Gate page for the target room.
4. Grant browser camera permission.
5. Verify the known face and confirm entitlement resolution produces the existing allow/open UI result.
6. Verify an unknown or non-enrolled face does not match.
7. Stop or restart Face AI and confirm the Gate shows a controlled unavailable error rather than crashing.
8. Restart Face AI and verify the enrolled user again; PostgreSQL embeddings should make re-enrollment unnecessary.

Do not create synthetic face data. Real camera, HTTPS, browser permission, and
physical-site behavior remain device/VPS validation tasks.
