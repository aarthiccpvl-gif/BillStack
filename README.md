# Internal Invoice & Quotation Management System

An internal web application for creating, managing, rendering and sharing professional
**quotations and invoices**. Single company, multi-currency, GST-aware, with full revision and
audit history.

> **Status: complete — all eight phases.** Raise a quotation, number it `QT001/2026-2027`, work in
> any of ten currencies, see GST broken into its components as you type, render it through the same
> engine the PDF uses, share it as a link that expires, convert it to `FT001/2026-2027` with every
> figure carried across, record what has been paid, and watch it fall overdue on its own. The
> dashboard adds up what is owed and what is late; reports answer the same questions over a date
> range and export as CSV, Excel or PDF containing exactly what the screen showed. Every action is on
> the audit trail, which can be read as sentences and exported like any other report. See
> [docs/09-roadmap.md](docs/09-roadmap.md) for what each phase delivered and
> [docs/11-decisions.md](docs/11-decisions.md) for the decisions that shaped it.

---

## Requirements

| Tool           | Version                      |
| -------------- | ---------------------------- |
| Node.js        | 20 LTS or 22 (`.nvmrc`)      |
| npm            | 10+ (workspaces)             |
| Docker Desktop | for MySQL, MailHog and MinIO |

## Getting started

```bash
npm install
```

```bash
npm run setup:env
```

`setup:env` creates `.env` from `.env.example` and generates the JWT secrets. It never overwrites an
existing `.env` unless you pass `--force`.

```bash
npm run docker:up
```

Starts MySQL (3306), MailHog (SMTP 1025, web UI http://localhost:8025) and MinIO
(API 9000, console http://localhost:9001).

```bash
npm run prisma:generate
```

```bash
npm run dev
```

| Service                              | URL                                    |
| ------------------------------------ | -------------------------------------- |
| Web application                      | http://localhost:5175                  |
| API                                  | http://localhost:4000/api              |
| Health (liveness)                    | http://localhost:4000/api/health       |
| Readiness (fails without a database) | http://localhost:4000/api/health/ready |
| MailHog                              | http://localhost:8025                  |
| MinIO console                        | http://localhost:9001                  |

The web app calls `/api` on its own origin and Vite proxies it to the backend, so authentication can
use httpOnly cookies with no CORS or SameSite workarounds in development.

## Database: local MySQL instead of Docker

Docker is convenient but optional — any MySQL 8 on port 3306 works, including the one bundled with
WAMP. One-time setup:

```bash
net start wampmysqld64
```

```bash
"C:/wamp64/bin/mysql/mysql8.4.7/bin/mysql.exe" -u root -p < scripts/setup-mysql.sql
```

That creates `invoice_db`, `invoice_db_test` and the `invoice` user matching the default
`DATABASE_URL`. Then apply the schema and seed it:

```bash
npm run prisma:deploy -w backend
```

```bash
npm run db:seed -w backend
```

`prisma:deploy` applies the committed migrations and needs no shadow database. Use
`npm run prisma:migrate -w backend` only when you are changing the schema and want a new migration.

Set the six `SEED_*` variables in `.env` before seeding — the seed refuses to invent credentials.

## Repository layout

```text
.
├── shared/     @app/shared — types, validation schemas, the decimal money engine
├── backend/    Express + TypeScript REST API, Prisma, service layer
├── frontend/   React + TypeScript + Vite + Bootstrap 5 web application
├── docs/       architecture and design documents (start with docs/README.md)
├── docker/     Dockerfiles and MySQL bootstrap
└── scripts/    developer utilities
```

`shared/` is what allows one set of validation schemas and one decimal calculation engine to run on
both sides: the backend uses it as the authority for every persisted figure, the browser uses it for
instant preview. There is no second implementation to drift.

## Commands

| Command                                        | What it does                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                                  | API and web app together with hot reload                           |
| `npm run dev:backend` / `npm run dev:frontend` | one side only                                                      |
| `npm run build`                                | builds `shared`, then `backend`, then `frontend`                   |
| `npm run typecheck`                            | TypeScript in strict mode across all workspaces                    |
| `npm test`                                     | Vitest in all workspaces                                           |
| `npm run lint` / `npm run lint:fix`            | ESLint                                                             |
| `npm run format` / `npm run format:check`      | Prettier                                                           |
| `npm run verify`                               | format check + lint + typecheck + tests — run this before a commit |
| `npm run prisma:generate`                      | regenerates the Prisma client                                      |
| `npm run prisma:migrate`                       | creates/applies a development migration                            |
| `npm run docker:up` / `docker:down`            | development infrastructure                                         |

## Working on Windows

The recommended loop is Docker for **infrastructure only** (`npm run docker:up`) with the apps
running natively — fastest hot reload, and PDF rendering uses local Chromium. Use
`docker compose --profile full up` when you need to verify the Linux/Chromium PDF path, which is how
production will render.

## Conventions worth knowing before you write code

- **The backend owns every figure.** Totals, taxes and document numbers are recomputed server-side;
  the create/update request schemas do not even accept them.
- **Money never becomes a float.** `Decimal` end to end, transported as a string, formatted through
  `formatMoney` from `@app/shared`. ESLint fails a backend `toFixed()` call.
- **Documents are snapshots.** Customer, address, tax, currency, company and template-version data
  is copied onto a document when it is saved, so editing a master never rewrites history.
- **Nothing financial is deleted.** Archive, cancel or void; soft delete for drafts only.
- **Permissions are checked at the API.** Hiding a button in the UI is presentation, not security.
- **One renderer.** The document preview and the PDF come from the same HTML, so they cannot disagree.

## Documentation

| Doc                                                                        | Contents                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [docs/00-architecture-overview.md](docs/00-architecture-overview.md)       | layers, stack, repo layout, env, Docker, testing                 |
| [docs/01-data-model-erd.md](docs/01-data-model-erd.md)                     | ER diagram and entity catalogue                                  |
| [docs/02-prisma-schema-design.md](docs/02-prisma-schema-design.md)         | full schema design and seed plan                                 |
| [docs/03-financial-tax-engine.md](docs/03-financial-tax-engine.md)         | decimal policy, calculation order, GST                           |
| [docs/04-numbering-financial-year.md](docs/04-numbering-financial-year.md) | financial years and document numbering                           |
| [docs/05-api-specification.md](docs/05-api-specification.md)               | endpoints, conventions, error codes                              |
| [docs/06-auth-rbac-audit-revision.md](docs/06-auth-rbac-audit-revision.md) | auth, permissions, audit, revisions                              |
| [docs/07-template-pdf-engine.md](docs/07-template-pdf-engine.md)           | template engine and PDF pipeline                                 |
| [docs/08-frontend-architecture.md](docs/08-frontend-architecture.md)       | modules, routes, state, editor                                   |
| [docs/09-roadmap.md](docs/09-roadmap.md)                                   | phase plan with exit criteria                                    |
| [docs/10-open-questions.md](docs/10-open-questions.md)                     | contradictions, gaps and the questions raised                    |
| [docs/11-decisions.md](docs/11-decisions.md)                               | **decision log** — the answers and their effects                 |
| [docs/12-pending-work-plan.md](docs/12-pending-work-plan.md)               | **pending work** — Phase 9, production readiness and known gaps  |
| [docs/13-operations.md](docs/13-operations.md)                             | **operations** — deploy, migrate, seed, backup, restore, upgrade |

## Not in scope

Payment gateways, customer portal, e-invoice/IRN, recurring invoices, automated reminders, expenses,
projects, timesheets, accounting integrations, multi-company and multi-tenancy. Each has a documented
extension point; none is implemented.
