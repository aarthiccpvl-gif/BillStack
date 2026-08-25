# 09 — Development Roadmap

Each phase ends with: what was built, files touched, architecture decisions, how to run it, how to
test it, what remains — then a stop for approval. Nothing is silently skipped; anything deferred is
recorded here and in `10-open-questions.md`.

---

## Phase 0 — Architecture  ✅ complete

**Output:** `docs/00`–`docs/11`. No application code.
**Exit criteria:** architecture approved and every question in `10-open-questions.md` answered —
see [11-decisions.md](11-decisions.md).

---

## Phase 1 — Project setup & skeleton  ✅ complete

**Build:** npm-workspaces monorepo; `shared/` package (constants, zod schemas, `DocumentData` type,
finance engine skeleton); Express + TS backend with config/env validation, logger, error handler,
envelope helpers, `GET /api/health`; Vite + React + TS frontend with Bootstrap/SCSS theme, router,
`AppShell`, Axios client, TanStack Query provider, toast provider; ESLint + Prettier + lint-staged;
`.env.example`; `docker-compose.yml` (mysql, mailhog, minio); `docker/*.Dockerfile`; root `README.md`.

**Exit criteria:** `npm run dev` starts both apps; the shell renders with placeholder pages;
`GET /api/health` returns `{ success: true, data: { status: "ok", db: "up" } }`; lint and typecheck
clean; a Vitest smoke test passes on all three workspaces. **No business modules.**

---

## Phase 2 — Database & authentication  ✅ complete

**Build:** the full Prisma schema from `docs/02` + initial migration; seed (permissions, roles, three
users from `SEED_*` env, currencies, tax types/rates/groups, units, numbering series, financial years,
placeholder company, three template shells); argon2 hashing; login/refresh/logout/me/change-password;
cookie handling; `requireAuth`, `requirePermission`, read-only-role guard, request context; audit
service + login auditing; login page, `AuthProvider`, route guards, profile page.

**Exit criteria:** all three seeded roles can log in; refresh rotation and reuse detection work;
`/api/auth/me` returns the permission array; the read-only guard rejects any non-GET from
FINANCE_VIEWER; audit rows exist for LOGIN/LOGIN_FAILED/LOGOUT.
**Tests:** auth suite + the table-driven RBAC harness (seeded with the routes that exist so far).

---

## Phase 3 — Company & master data  ✅ complete

**Build:** company settings (all fields, branding, bank accounts) with logo/signature/favicon upload
via `StorageService`; masters CRUD (currencies, tax types/rates/groups, units, item categories,
financial years, numbering series) — Super Admin only; customers (list, create, edit, addresses,
contacts, archive, detail page with history tabs and summary); items (list, create, edit, archive);
`FinancialYearService` and `NumberingService` with the concurrency test; matching React screens wired
to the real API (no mocks).

**Exit criteria:** an admin can configure the company, upload a logo, and create real customers and
items; a Finance Viewer can read them and is refused on every write; numbering generates
`FT001/2026-2027` correctly and survives 20 parallel requests.

---

## Phase 4 — Template engine  ✅ complete

**Build:** `TemplateConfig` zod schema; template + version CRUD with publish/clone/immutability;
`render/` module — blocks, `base.print.css`, theme mapping, self-hosted fonts, three layouts
(Corporate, Modern, Classic) × invoice/quotation; `POST /api/templates/preview` with sample data;
`PdfService` (Puppeteer pool) and `StorageService` wiring; template list UI + two-pane editor with
live preview.

**Exit criteria:** six template/doc-type combinations render from sample data; the config switches all
visibly work; a published version cannot be edited; a preview HTML and its PDF are visually identical;
golden snapshots and the PDF assertions (page numbers, repeated headers, logo) pass.

---

## Phase 5 — Quotations  ✅ complete

**Build:** `CalculationService` (full engine, all fixtures green) and `TaxService` place-of-supply
resolution; quotation create/update inside one transaction (snapshots, numbering, FY, tax summary);
list with filters/search/paging; detail page with preview, timeline and actions; the generic
`DocumentEditor` + items grid + totals + preview pane; status transitions; PDF generate/download;
secure share link and WhatsApp deep link (**no email — decision Q14**); `RevisionService` + history
UI; duplicate.

**Exit criteria:** the whole PRD §15–§19 quotation flow works against a real database; totals match
the fixtures to the last minor unit; a post-issue edit produces v2 with an intact v1 snapshot and its
own PDF; WhatsApp share opens a pre-filled `wa.me` link containing the secure document URL (no API
integration).

**Verified:** 39/39 live checks against the real database (numbering, snapshotting, the §16 worked
example, ignored client-supplied totals, transition rules, change-reason enforcement, revisions,
version-1 figures preserved, HTML preview, PDF generation/caching/download, share links including the
public route and revocation, duplicate, delete rules, round-off persistence) plus a Finance Viewer
pass showing read allowed and every write refused with 403.

**Changed along the way:** the round-off setting is now stored (`round_off_enabled`) rather than
inferred from a zero amount; `optionalText` / `optionalEmail` / `optionalId` moved into
`schemas/common.ts` and accept `null`, so a client can send back exactly what it read; a share link's
address is `null` after creation instead of an empty string, and the UI says so.

**Deferred:** the quotation → invoice conversion endpoint moves to Phase 6, where the invoice it
creates actually exists.

---

## Phase 6 — Invoices & conversion

**Build:** invoices reusing every shared service (only the config/status/date differences are new);
issue/cancel/void with mandatory reasons; due-date and payment-terms handling; derived `OVERDUE`;
manual payment status and `amountPaid` (decision Q2); `ConversionService` — quotation → invoice copying customer,
addresses, currency, exchange rate, all lines with taxes and discounts, notes, terms, bank selection,
setting `invoices.quotationId`, flipping the quotation to `CONVERTED` and back-linking
`convertedInvoiceId`, all in one transaction with audit + revision entries.

**Exit criteria:** `QT025/2026-2027 → FT018/2026-2027` transfers every field with identical totals; a
quotation cannot be converted twice; the invoice's number comes from the invoice series in the FY of
the invoice date; the quotation detail page shows "Converted to FT018/2026-2027".

---

## Phase 7 — Finance Viewer hardening

**Build:** dashboard (KPI cards, monthly value charts, conversion funnel, recent documents) with
per-currency and base-currency roll-ups; Finance sidebar/routes; downloads workspace; bulk PDF ZIP;
`/api/search`; the complete route × role RBAC matrix test; 403 page and UI permission gating audit.

**Exit criteria:** the automated matrix proves every write endpoint returns 403 for FINANCE_VIEWER and
200 for the roles entitled to it; a Finance Viewer can complete view → filter → export → download
end to end and can reach nothing else.

---

## Phase 8 — Reports, exports & audit

**Build:** quotation / invoice / customer / monthly-summary reports with the PRD's filters and
columns; CSV, XLSX (styled, formatted numbers, frozen header) and PDF report exports that honour the
active filters exactly; bulk download; audit log viewer with filters and entity drill-down; audit
export; the expiry/overdue daily job.

**Exit criteria:** an export of a filtered list contains exactly the rows the list showed; a 5,000-row
export streams without exhausting memory; audit entries exist for `REPORT_EXPORTED`,
`DOCUMENT_DOWNLOADED` and `BULK_DOWNLOAD`.

---

## Phase 9 — Hardening & handover *(short)*

Playwright E2E of the PRD §77 success path; rate limits and security headers reviewed; DB backup and
restore runbook; seed-in-production procedure; `README` operations section; performance pass on the
list and dashboard queries; final MVP acceptance checklist walkthrough against PRD §68.

---

## Extension points left deliberately unimplemented

| Future feature | Seam already in place |
|---|---|
| Payment gateway | `payments/PaymentProvider` interface, `invoices.amountPaid`, `FEATURE_PAYMENTS` flag, webhook-friendly status machine. A full payments ledger replaces the single column at that point |
| Customer portal | `document_shares` tokens + the public read-only route + `VIEWED` tracking |
| WhatsApp Business API | `whatsapp/ShareProvider` interface; MVP uses a `wa.me` deep link |
| Email delivery | `MailService` + SMTP adapter and MailHog stay wired but unused (decision Q14) — enabling it is configuration plus one service call |
| E-invoice / IRN | `DocumentData.meta.qrPayload` reserved; GSTIN/HSN/state codes already captured |
| Recurring invoices | Document creation is a pure service call on a snapshot payload — a scheduler can call it |
| Credit / debit notes | `DocType.CREDIT_NOTE` enum member and numbering series slot reserved |
| Multi-company / multi-tenant | Company is a table row (id = 1) rather than constants; documents snapshot the company |
| Accounting integration | Export services and stable document IDs; no UI coupling |
