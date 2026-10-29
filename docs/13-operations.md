# 13 — Operations Runbook

This is the production procedure for the single-origin Docker deployment. It assumes Linux, Docker
Engine with Compose v2, and a TLS-terminating proxy or load balancer in front of the application.

---

## 1. Topology

```text
Browser ── HTTPS ──> reverse proxy / load balancer ──> backend:4000
                                                          │
                                                          ├── MySQL 8 (private network)
                                                          └── /app/var/storage (named volume)
```

The backend image also contains the built web app. There is **one origin**, which is why the
httpOnly auth cookies work without cross-site configuration. MySQL is not published to the host.

Files:

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | MySQL + backend, private network, health checks, named volumes |
| `docker/backend.Dockerfile` | builds shared, backend, frontend and serves all three |
| `.env.production.example` | production environment template |
| `scripts/release.sh` | applies Prisma migrations |
| `scripts/backup.sh` | database + storage archive |
| `scripts/restore.sh` | restores a backup pair |

---

## 2. First deployment

### 2.1 Prepare the host

- Install Docker Engine and Compose v2.
- Create a directory, e.g. `/opt/billstack`, and clone the repository.
- Point DNS at the host and terminate TLS at the proxy/load balancer.
- Open only 80/443 publicly. Do not publish 3306 or 4000 directly to the internet.

### 2.2 Configure

```bash
cp .env.production.example .env.production
```

Fill in:

- `APP_URL` and `FRONTEND_URL` — the same public HTTPS origin.
- `COOKIE_DOMAIN` — the public hostname.
- `COOKIE_SECURE=true`.
- `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` — strong, unique values.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — at least 32 random characters each. They must differ.
- `SEED_*` — the three initial users. Remove these values after the first seed.

Generate secrets with:

```bash
openssl rand -base64 48
```

Keep `.env.production` out of Git and restrict it to the deployment user (`chmod 600`).

### 2.3 Start the database and apply migrations

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d mysql
./scripts/release.sh
```

### 2.4 Seed the first users and reference data

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend \
  npx tsx backend/prisma/seed.ts
```

The seed is idempotent. It creates permissions, roles, the three `SEED_*` users (all with
`mustChangePassword`), currencies, tax rates/groups, units, financial years, numbering series and a
placeholder company. It does **not** create demo customers or documents.

After the seed:

1. Remove `SEED_*` from `.env.production`.
2. Start the app.
3. Sign in as the Super Admin and change the password.
4. Complete **Administration → Company Settings** (the UI warns while the company is the
   placeholder).
5. Confirm the current financial year and the `QT`/`FT` numbering series under
   **Administration → Masters & Numbering**.

### 2.5 Start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check:

```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS http://127.0.0.1:4000/api/health/ready
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The boot log should include `PDF renderer ready` from the Chromium smoke test. If it says the
renderer is unavailable, PDF generation will fail — fix that before accepting traffic.

---

## 3. Routine operations

### Logs

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

### Health

- `/api/health` — liveness and database check.
- `/api/health/ready` — readiness; fails if the database is unavailable.

### Backups

```bash
BACKUP_DIR=/mnt/backups ./scripts/backup.sh
```

This writes `db-YYYYmmdd-HHMMSS.sql.gz` and `storage-YYYYmmdd-HHMMSS.tar.gz`, then deletes archives
older than `BACKUP_RETENTION_DAYS` (default 30).

Schedule it from the host, for example:

```cron
15 2 * * * cd /opt/billstack && BACKUP_DIR=/mnt/backups ./scripts/backup.sh >> /var/log/billstack-backup.log 2>&1
```

Copy the archives off the host (object storage or a backup server) and encrypt them at rest. Test a
restore at least quarterly.

### Restore

```bash
RESTORE_CONFIRM=yes ./scripts/restore.sh \
  /mnt/backups/db-20261029-021500.sql.gz \
  /mnt/backups/storage-20261029-021500.tar.gz
```

The script stops the backend, restores the database and storage, and starts the backend again. Do it
in a maintenance window.

### Upgrade

```bash
git pull
./scripts/release.sh                       # migrations first, old app still running
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Prisma migrations are forward-only. Before a release, take a backup. If the release must be rolled
back, check out the previous commit and rebuild; migrations that have already run are not undone.

### Rotate secrets

- JWT secrets: replacing them invalidates every session. Users sign in again.
- Database password: update `.env.production`, change it in MySQL, then recreate the backend
  container.
- `SEED_*`: remove them after the initial seed.

---

## 4. Troubleshooting

| Symptom | Check |
|---|---|
| Every request answers 401 | `APP_URL` and `FRONTEND_URL` must be the same origin; `COOKIE_SECURE=true` needs HTTPS; `COOKIE_DOMAIN` must match the host |
| PDF generation fails | Boot log smoke test; Chromium libraries in the image; `PUPPETEER_EXECUTABLE_PATH` should normally be blank |
| `P1001` database unreachable | MySQL health, `MYSQL_PASSWORD`, and the `DATABASE_URL` built by Compose |
| Uploads disappear after redeploy | The `storage_data` volume must be mounted at `/app/var/storage` |
| Migrations fail during release | Restore the pre-release backup; fix the migration; never edit an applied migration |
| Disk fills up | Check `mysql_data`, `storage_data`, `/app/var/storage` and the backup directory; apply retention |

---

## 5. Security checklist

- [ ] TLS terminates in front of the app; HTTP redirects to HTTPS.
- [ ] `COOKIE_SECURE=true`; `COOKIE_DOMAIN` is the real host.
- [ ] MySQL is not published; only 4000 (or the proxy) is reachable.
- [ ] `JWT_*` and database secrets are unique and stored outside Git.
- [ ] `.env.production` is owned by the deployment user and mode `600`.
- [ ] Backups are off-host, encrypted, and a restore has been drilled.
- [ ] Login rate limiting is active; lockout values are appropriate.
- [ ] Host and container images are patched on a schedule.
- [ ] Logs are shipped/retained and do not contain tokens or passwords.
- [ ] The PDF smoke test passes at boot.

---

## 6. Known limitations

- **Storage:** production uses the named local volume. `STORAGE_PROVIDER=s3` is reserved but not
  implemented; do not set it.
- **Email:** sending is out of scope by decision Q14. Sharing is download, secure link and a
  `wa.me` link.
- **Dependency advisory:** Zod 3 has one high-severity advisory (memory exhaustion on oversized
  constrained collections). Request bodies are capped at 1 MB; the Zod 4 upgrade remains on the
  pending plan.
- **Single instance:** the daily job is an in-process timer. Do not scale the backend to multiple
  replicas without moving the job to a single scheduler.
- **Attachments and the global financial-year selector** are pending; see
  [12-pending-work-plan.md](12-pending-work-plan.md).
