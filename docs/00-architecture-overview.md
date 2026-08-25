# 00 — Architecture Overview

## 1. Product framing

A **single-company, internal** quotation & invoice platform for the IT department. Zoho Invoice is a
functional reference only. Four qualities decide whether this product succeeds:

1. Document creation feels like a professional accounting app (fast, keyboard-friendly, no surprises).
2. Financial figures are always correct and always computed server-side.
3. PDFs look exactly like the on-screen preview.
4. Every change to a financial document is recoverable and attributable.

Everything else (dashboards, reports, exports) is supporting cast.

## 2. Guiding principles

| # | Principle | Consequence in code |
|---|---|---|
| P1 | Backend is the only authority on money and document numbers | Frontend totals are display-only; API ignores client-sent totals/numbers entirely |
| P2 | Documents are **snapshots**, not live joins | Customer name/address/GSTIN, item name, tax rate, currency symbol, company details and template version are copied onto the document at save time |
| P3 | One calculation engine, two consumers | Pure decimal engine lives in `shared/`; backend uses it as the authority, frontend uses it for instant preview |
| P4 | Nothing financial is ever hard-deleted | Archive / Cancel / Void; soft delete for drafts only |
| P5 | Rendering is data-driven | `DocumentData + TemplateConfig + Branding → HTML → PDF`; no layout logic inside React pages |
| P6 | RBAC is enforced at the API, not the UI | `requirePermission()` on every mutating route; UI hiding is cosmetic |
| P7 | Quotation and Invoice share behaviour, not tables | Separate tables (per PRD §51/§52), shared services and generic UI |
| P8 | Extension points, not extensions | Payments, portal, e-invoice, recurring get interfaces and enum room — no implementation |

## 3. Layered architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ React SPA (Vite + TS + Bootstrap 5 + SCSS)                       │
│  routes/guards → modules → TanStack Query hooks → Axios client   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS / JSON (httpOnly cookie auth)
┌───────────────────────────────▼──────────────────────────────────┐
│ Express HTTP layer                                               │
│  helmet · cors · rate-limit · requestContext · auth · rbac       │
│  zod validation (shared schemas) · controllers · error handler   │
└───────────────────────────────┬──────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────┐
│ Service layer (all business rules; framework-free)               │
│  DocumentService · CalculationService · TaxService               │
│  NumberingService · RevisionService · AuditService               │
│  RenderService · PdfService · StorageService · MailService       │
│  ShareService · ReportService · ExportService                    │
└───────────────────────────────┬──────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────┐
│ Data access — Prisma Client (repositories where useful)          │
└───────────────────────────────┬──────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────┐
│ MySQL 8  ·  Object/File storage (local FS → S3-compatible)       │
└──────────────────────────────────────────────────────────────────┘
```

Document generation pipeline (deliberately isolated from the CRUD path):

```text
Quotation/Invoice row + children
        ↓  DocumentService.buildDocumentData()
DocumentData  (pure, versioned JSON contract in shared/)
        ↓  + TemplateVersion.config + CompanySnapshot
RenderService  (React SSR → static HTML + inlined CSS + data-URI assets)
        ↓
        ├─→ HTML → browser preview (sandboxed iframe)
        └─→ HTML → PdfService (Puppeteer, A4) → PDF → StorageService → DocumentFile row
```

The same `RenderService` output feeds both preview and PDF. This is the only way to guarantee
"the PDF matches the preview", and it is a hard architectural rule.

## 4. Technology stack (as directed, with pinned choices)

| Concern | Choice | Note |
|---|---|---|
| Runtime | Node.js 20 LTS | 22 also fine; pin via `.nvmrc` + `engines` |
| Language | TypeScript 5.x, `strict: true` everywhere | plus `noUncheckedIndexedAccess` |
| Frontend | React 18 + Vite 5 + React Router 6 | Vite dev proxy `/api → :4000` (same-origin cookies) |
| UI | Bootstrap 5.3 + custom SCSS theme | Bootstrap imported via SCSS with overridden variables, not CDN CSS |
| Forms | React Hook Form + `@hookform/resolvers/zod` | Zod schemas imported from `shared/` |
| Server state | TanStack Query v5 | Query-key factory per module |
| Icons | Lucide React | |
| HTTP | Axios instance with interceptors | 401 → silent refresh → retry once |
| Backend | Express 4 + TS | Thin controllers, fat services |
| ORM | Prisma 5 (MySQL provider) | `Decimal` columns; migrations committed |
| DB | MySQL 8.0 (utf8mb4, InnoDB) | `STRICT_TRANS_TABLES` |
| Money | `decimal.js` (via `Prisma.Decimal`) | **No** float arithmetic on persisted values |
| Auth | JWT in httpOnly cookies (access + rotating refresh) | `@node-rs/argon2` hashing (prebuilt binaries — no build toolchain needed on Windows) |
| Validation | Zod (shared frontend/backend) | One schema, two consumers |
| PDF | Puppeteer (bundled Chromium) | Playwright is the fallback if Chromium packaging fights us |
| Email | `MailService` interface; `nodemailer` SMTP adapter + `LogMailAdapter` for dev | MailHog in docker-compose |
| Storage | `StorageService` interface; `LocalDiskAdapter` (dev) + `S3Adapter` (later) | MinIO in docker-compose for S3 parity |
| Export | `csv-stringify`, `exceljs`, Puppeteer (PDF reports), `archiver` (ZIP bulk) | Streamed, never fully buffered |
| Logging | `pino` + `pino-http`, request-id correlation | JSON logs, secrets redacted |
| Tests | Vitest + Supertest + Playwright (from Phase 5) | |
| Lint/format | ESLint (typescript-eslint) + Prettier + `lint-staged` | Shared root config |

## 5. Repository layout (npm workspaces monorepo)

```text
invoice-management-system/
├── package.json                # workspaces: frontend, backend, shared; root scripts
├── docker-compose.yml          # mysql, mailhog, minio, (backend/frontend profiles)
├── .env.example
├── README.md
├── docs/                       # this folder
├── docker/
│   ├── backend.Dockerfile      # includes Chromium deps for Puppeteer
│   ├── frontend.Dockerfile
│   └── mysql/init.sql
│
├── shared/                     # @app/shared — imported by BOTH sides
│   └── src/
│       ├── constants/          # enums: roles, permissions, statuses, tax types, doc types
│       ├── schemas/            # zod: auth, customer, item, document, template, filters
│       ├── types/              # DocumentData contract, TemplateConfig, ApiEnvelope, DTOs
│       ├── finance/            # decimal calculation engine + currency formatting (pure)
│       └── utils/              # date/FY helpers, number formatting, guards
│
├── backend/
│   ├── prisma/{schema.prisma, migrations/, seed.ts}
│   └── src/
│       ├── app.ts  server.ts
│       ├── config/             # env parsing (zod), constants, container
│       ├── middleware/         # auth, rbac, validate, requestContext, errorHandler, upload
│       ├── modules/<domain>/   # controller + routes + service + repository + mapper + tests
│       │   ├── auth  users  customers  items
│       │   ├── quotations  invoices  documents (shared document logic)
│       │   ├── templates  settings  masters (currencies/taxes/units/fy)
│       │   └── reports  exports  audit  dashboard
│       ├── services/           # cross-domain: numbering, revision, audit, share, calculation
│       ├── render/             # template registry, React SSR layouts, print CSS
│       ├── pdf/                # puppeteer pool, page config, header/footer
│       ├── storage/            # StorageService + local/s3 adapters
│       ├── email/              # MailService + adapters + templates
│       ├── whatsapp/           # ShareProvider interface only (no impl) ← extension point
│       ├── payments/           # PaymentProvider interface only (no impl) ← extension point
│       ├── routes/index.ts     # mounts /api/*
│       └── utils/              # errors, logger, decimal, pagination, csv/xlsx writers
│
└── frontend/
    └── src/
        ├── app/                # AppRouter, providers, QueryClient, ErrorBoundary
        ├── layouts/            # AppShell (sidebar/topbar/breadcrumbs), AuthLayout
        ├── components/         # DataTable, FormField, Money, StatusBadge, Modal, Toast…
        ├── modules/<domain>/   # pages + components + api + hooks per module
        ├── services/  hooks/  guards/  types/  utils/  constants/  styles/
        └── main.tsx
```

**Why `shared/` exists:** it satisfies two PRD rules simultaneously — "never trust the frontend"
(the backend recalculates using the engine) and "no duplicated business logic" (there is exactly one
engine and one set of validation schemas). Published as a workspace package with TS project
references so both sides consume typed output.

## 6. Cross-cutting concerns

### 6.1 API response envelope

```json
{ "success": true,  "data": {}, "meta": { "page": 1, "pageSize": 25, "total": 132 } }
```

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid invoice data",
    "details": [ { "path": "items.0.quantity", "message": "Must be greater than 0" } ],
    "requestId": "01J8…" } }
```

Every response passes through one `sendSuccess`/`errorHandler` pair — controllers never build
envelopes by hand.

### 6.2 Error model

`AppError(code, httpStatus, message, details?)` with subclasses `ValidationError (422)`,
`UnauthorizedError (401)`, `ForbiddenError (403)`, `NotFoundError (404)`, `ConflictError (409)`,
`BusinessRuleError (422)`, `RateLimitError (429)`, `InternalError (500)`. Zod failures and Prisma
error codes (P2002 → `DUPLICATE_RESOURCE`, P2025 → `NOT_FOUND`, P2003 → `INVALID_REFERENCE`) are
mapped centrally. Stack traces never leave the server; `requestId` does, so a user can quote it.

### 6.3 Request context

`AsyncLocalStorage` carries `{ requestId, userId, roleKey, ip, userAgent }` so `AuditService` and
`RevisionService` never need these threaded through every function signature.

### 6.4 Security baseline

`helmet`, CORS locked to `FRONTEND_URL` with credentials, global rate limit plus a strict limiter on
`/api/auth/login`, body size caps, upload MIME + extension + magic-byte validation, Prisma
parameterisation (raw SQL only for `SELECT … FOR UPDATE`, with bound params), `SameSite=Lax`
httpOnly cookies plus a custom-header CSRF check on mutations, and signed opaque tokens for public
share links.

### 6.5 Time & dates

Application timezone `Asia/Kolkata` (configurable). Document dates (`quotationDate`, `dueDate`,
`expiryDate`) are stored as **DATE**, never DATETIME, to avoid timezone drift. System/audit
timestamps are `DATETIME(3)` in UTC.

## 7. Environment variables (`.env.example`)

```text
# --- core ---
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:4000
FRONTEND_URL=http://localhost:5173
TZ=Asia/Kolkata

# --- database ---
DATABASE_URL=mysql://invoice:invoice@localhost:3306/invoice_db

# --- auth ---
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15

# --- seed (first run only; never commit real values) ---
SEED_SUPER_ADMIN_EMAIL=
SEED_SUPER_ADMIN_PASSWORD=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_FINANCE_EMAIL=
SEED_FINANCE_PASSWORD=

# --- storage ---
STORAGE_PROVIDER=local            # local | s3
STORAGE_LOCAL_ROOT=./var/storage
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
UPLOAD_MAX_MB=5
ATTACHMENT_MAX_MB=10

# --- pdf ---
PDF_ENGINE=puppeteer
PUPPETEER_EXECUTABLE_PATH=
PDF_CONCURRENCY=2
PDF_TIMEOUT_MS=30000

# --- email ---
MAIL_PROVIDER=smtp                # smtp | log
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Company Billing <billing@example.com>"
MAIL_BCC_ARCHIVE=

# --- sharing / feature flags ---
SHARE_LINK_TTL_DAYS=30
FEATURE_WHATSAPP=false
FEATURE_PAYMENTS=false
FEATURE_MANUAL_PAYMENTS=true      # pending decision — see 10-open-questions.md

# --- ops ---
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
```

Env is parsed once through a Zod schema at boot; the process refuses to start on a missing or
malformed required value (fail fast — never `process.env.X!` scattered through the code).

## 8. Docker development architecture

```text
docker-compose.yml
├── mysql      : mysql:8.0        3306        volume mysql_data
├── mailhog    : mailhog/mailhog  1025 / 8025 (SMTP sink + web UI)
├── minio      : minio/minio      9000 / 9001 (S3 parity for the storage adapter)
├── backend    : docker/backend.Dockerfile  4000   (profile: full)
└── frontend   : docker/frontend.Dockerfile 5173   (profile: full)
```

Default developer loop on Windows: run **only** `mysql`, `mailhog`, `minio` in Docker and run
backend/frontend natively (`npm run dev`) — fastest HMR, and Puppeteer uses local Chromium. The
`full` profile exists for CI and for verifying the Linux/Chromium PDF path, because
Puppeteer-in-container needs an explicit font/library set (`fonts-liberation`, `libnss3`,
`libatk-bridge2.0-0`, …). Because PDF output varies with the OS font stack, **fonts are self-hosted
and embedded into the print CSS** rather than resolved from the system (see
`07-template-pdf-engine.md`).

## 9. Testing strategy

| Layer | Tool | What is tested |
|---|---|---|
| Finance engine | Vitest (pure) | Every worked example in the PRD, rounding, discount allocation, multi-tax lines, JPY 0-decimals, zero/negative guards |
| Numbering | Vitest + real MySQL | FY rollover, padding, parallel creation (no duplicates) |
| API | Supertest + test DB | Auth flows, full RBAC matrix (role × endpoint), validation rejects, revision creation, conversion |
| Repository | Vitest + test DB | Transactions roll back on failure |
| Render | Vitest snapshot | HTML golden files per template × config permutation |
| PDF | Vitest + `pdf-parse` | Page count, page numbers, totals/currency strings, logo present, repeated table headers |
| Frontend | Vitest + React Testing Library | Editor totals mirror backend fixtures; guards hide and deny |
| E2E | Playwright | The PRD §77 "definition of success" path, end to end |

`npm test` at the root runs everything; `npm run test:db` provisions the MySQL test schema.

## 10. Coding standards (enforced, not aspirational)

- No React component over ~250 lines; a page is layout + hooks, with logic in hooks/services.
- No Express route file over ~120 lines; no business logic in controllers.
- No `any` in `shared/` or in service signatures; DTO in, DTO out.
- Money never becomes a `number` after leaving the DB — `Prisma.Decimal` end to end, serialised as a
  string over the wire, parsed by the frontend `Money` helper.
- Every mutating service method takes an explicit actor and writes an audit entry.
- Tax rates, currencies, units, statuses and company details come from the database or
  `shared/constants` — never inlined in a component.
