# 12 — Pending Work Plan

> **Baseline:** commit `00e1d9c` ("fixed customer module bugs", 31 Aug 2026)
> **Verified:** 29 Oct 2026, working copy `D:\Devv\billstack`
> **Scope:** everything that is not complete at the baseline — verified against the code, the
> test suite, the PRD and [11-decisions.md](11-decisions.md).

---

## 1. Purpose

Phases 1–8 are implemented and pass their automated checks. This plan covers:

1. **Phase 9** — hardening and handover, which is explicitly not started.
2. **Gaps found during this review** — requirements that the phase documents assumed were done,
   or decisions that were taken but never built.
3. **Production readiness** — the pieces needed to run this outside a developer machine.

It is deliberately not a re-plan of phases 1–8. Anything already working is listed once in §3 and
then left alone.

---

## 2. Baseline verification

### 2.1 What was run

| Check | Command | Result |
|---|---|---|
| Install | `npm install` | 706 packages. **Node 24.18.0** installed; repo asks for `>=20 <23` (`.nvmrc` = 22). npm 11 blocked Prisma/Puppeteer install scripts. |
| Prisma client | `npm run prisma:generate` | Pass (must be run manually after install on this machine). |
| Typecheck | `npm run typecheck` | **Pass** — shared, backend, frontend. |
| Tests | `npm test` | **Pass** — 107 shared + 94 backend + 85 frontend = **286 tests**. |
| Build | `npm run build` | **Pass** — backend `dist/`, frontend `dist/` (668.53 kB JS, 190.72 kB gzip, 2.74 MB source map). |
| Lint | `npm run lint` | **Pass**. |
| Format | `npm run format:check` | **Fail** — 249 files flagged. Cause: Windows `core.autocrlf=true` with no `.gitattributes`, against Prettier `endOfLine: "lf"`. Not a source defect, but `npm run verify` is red on this clone. |
| Production audit | `npm audit --omit=dev` | **20 vulnerabilities — 3 critical, 11 high, 6 moderate.** |
| Git state | `git status` | Clean apart from the plan file (`.env` and `node_modules` are ignored). |

### 2.2 What the baseline proves

- The application compiles, builds and passes its unit/integration suite.
- The safety-critical logic is tested: auth/RBAC matrix, numbering, money engine, PDF rendering,
  reports and permission gating.
- It does **not** prove that the PRD §77 end-to-end workflow works in a browser, that a fresh
  production host can be deployed, or that a damaged database can be restored.

### 2.3 Progress after this pass — 29 Oct 2026

The production-readiness track and the two decided-but-unbuilt features are now implemented in the
working tree:

| Item | State | Evidence |
|---|---|---|
| OPS-01 production image | Implemented; build unverified | Multi-stage backend image builds the frontend and serves it on one origin; `docker compose config` validates. The local Docker daemon was unavailable, so the image itself has not been built here. |
| OPS-02 release procedure | Complete | `scripts/release.sh`, `docker-compose.prod.yml`, `docs/13-operations.md` |
| OPS-03 production storage | Complete (option B) | Local disk on a named persistent volume; `STORAGE_PROVIDER=s3` remains reserved and fails clearly rather than pretending. |
| OPS-04 backup / restore | Complete (drill pending) | `scripts/backup.sh`, `scripts/restore.sh`, runbook |
| OPS-05 production seed | Complete | First-run and secret procedure in `docs/13-operations.md` |
| SEC-01 dependencies | Complete with accepted residual | 0 critical, 1 high (Zod 3), 6 moderate; CI gate is `--audit-level=critical` |
| SEC-02 security review | Complete | Helmet/CSP, rate limits, cookie flags, `trust proxy`, source maps off, scoped `files/:id` access |
| CI-01 continuous integration | Complete | `.github/workflows/ci.yml`, `.gitattributes` |
| OBS-01 boot PDF smoke | Complete | `smokeTestRenderer()` wired into `server.ts` |
| CFG-01 configuration cleanup | Complete | Unused `force` and feature/PDF flags removed; Node engine widened to `>=20 <25` |
| FEAT-01 financial-year selector | Complete | Global provider + topbar selector; scopes dashboard, lists, downloads, reports and exports, including customer and monthly-summary aggregates; tests cover default, persistence, All and export parity. |
| FEAT-02 document attachments | Complete | Quotation/invoice routes and panel; magic-byte and size validation; audit actions and migration; quotation → invoice copy on conversion; tests. |

---

## 3. Completeness against the PRD and decisions

### 3.1 Complete

| Area | Evidence |
|---|---|
| Customers, items, masters, company settings | Modules, routes, screens, tests |
| Numbering and financial years | `NumberingService`, `FinancialYearService`, concurrency tests |
| Templates, versions, branding, logo, signature/seal | Template CRUD, renderer, six layouts, PDF tests |
| Quotations and invoices | Create/edit/preview/PDF/share/convert/status/revisions |
| Multi-currency, GST, round-off, amount in words | Shared decimal engine and fixtures |
| Reports, CSV/XLSX/PDF exports, bulk download | One report definition, four renderers |
| Audit log and export | Viewer, entity drill-down, report export |
| Dashboard and global search | KPIs, charts, funnel, recent documents |
| RBAC | 110-route live-router matrix, frontend navigation audit |

### 3.2 Pending or missing

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | **Phase 9 — hardening & handover** | In progress | P0 complete; E2E, performance, accessibility and docs reconciliation remain |
| 2 | **Global financial-year selector (Q17)** | Complete | Provider + topbar selector; scopes dashboard, lists, downloads, reports and exports, including customer and monthly-summary aggregates |
| 3 | **Document attachments (PRD §17, §21, §58)** | Complete | Shared quotation/invoice routes and panel; conversion copy; audit actions and migration |
| 4 | **S3 storage adapter** | Deferred (decision) | Production uses local disk on a named volume; `STORAGE_PROVIDER=s3` remains reserved |
| 5 | **Production frontend image** | Implemented; build unverified | Multi-stage image serves the built frontend; Docker daemon unavailable on this machine |
| 6 | **CI pipeline** | Complete | `.github/workflows/ci.yml` |
| 7 | **Playwright E2E (PRD §77)** | Missing | No Playwright dependency or spec |
| 8 | **Backup / restore runbook and drill** | Complete (drill pending) | Scripts and runbook; a timed restore drill still needs running on a host |
| 9 | **Seed-in-production procedure** | Complete | `docs/13-operations.md` |
| 10 | **Boot-time PDF smoke** | Complete | Wired into the boot path in `server.ts` |
| 11 | **Reproducible "live checks"** | Missing | No script or spec is committed |
| 12 | **Dependency security** | Improved | 0 critical, 1 high (Zod 3), 6 moderate; the high is accepted and the CI gate is critical-only |
| 13 | **Unused `force` package** | Removed | Removed from `package.json` and the lockfile |
| 14 | **Unused feature flags/config** | Removed | Unused feature/PDF flags removed; mail settings retained as reserved |
| 15 | **Documentation drift** | Partially addressed | Operations and production docs added; older design docs still need reconciliation |
| 16 | **Formatting portability** | Complete | `.gitattributes` with LF normalisation; `format:check` passes |

### 3.3 Confirmed out of scope (do not build)

These are excluded by [11-decisions.md](11-decisions.md) or PRD §76 — they are **not** pending work:

- Email sending — decision Q14 overrides PRD §31/§54/§68. "Sending" means download, secure share
  link and a `wa.me` deep link; `SENT` is set manually.
- Payment gateway, payments ledger, customer portal, e-invoice/IRN, recurring invoices, automated
  reminders, expenses, projects, timesheets, accounting integrations, multi-company, multi-tenant,
  AI features.
- Customer self-service approval.

> **Documentation correction needed:** several design docs still describe `MailService`, an SMTP
> adapter and `email_messages`. They were removed by Q14. The docs should say "reserved extension
> point", not "wired but unused".

---

## 4. Pending work

Priorities:

- **P0** — blocks a production go-live.
- **P1** — required by the PRD or an already-taken decision.
- **P2** — acceptance, quality and maintainability; required to call Phase 9 done.
- **P3** — optional/future, only with a new decision.

### P0 — Production readiness

#### OPS-01 — Production image and deployment topology
**Why:** the current frontend image is a Vite dev server; it is not a production artefact.

**Scope:**
- Choose one topology and document it. Recommended: **single origin** — build the frontend, copy
  `frontend/dist` into the backend image, let Express serve it (`FRONTEND_DIST`, already supported
  in `app.ts`). This keeps httpOnly cookies working with no CORS/SameSite workarounds.
- Add a production Dockerfile stage and `docker-compose.prod.yml` (MySQL + backend, persistent
  volumes, health checks, `restart: unless-stopped`, no dev server, no source maps).
- Set production env explicitly: `NODE_ENV=production`, `COOKIE_SECURE=true`, `APP_URL` and
  `FRONTEND_URL` on the real origin, `COOKIE_DOMAIN` unset or the real domain.
- Add a reverse proxy/TLS decision (Caddy/nginx/Traefik) if the app is not terminated upstream.

**Acceptance:**
- A clean Linux host runs one command; the app and API are on one origin over HTTPS.
- Login, PDF generation and download work in the container.
- No Vite process is running in production.
- `docker compose config` validates and the health check passes.

**Estimate:** 2 d · **Depends on:** D2

#### OPS-02 — Release and migration procedure
**Why:** `prisma migrate deploy` is documented for development, but there is no release procedure.

**Scope:**
- Define the release order: backup → `prisma migrate deploy` (one instance only) → start new
  backend → smoke check → shift traffic.
- Add a `scripts/release.sh` or compose one-shot job; fail the release if migrations fail.
- Document rollback (application rollback is safe only if migrations are backward-compatible).

**Acceptance:**
- Fresh database and upgrade-from-previous-schema both deploy without manual SQL.
- A failed migration leaves the old version running.
- The procedure is repeatable by someone who did not write the code.

**Estimate:** 0.5 d · **Depends on:** OPS-01

#### OPS-03 — Production storage
**Why:** `STORAGE_PROVIDER=s3` is accepted by config but throws at runtime. Production currently has
only a container-local volume, which is lost if the volume is not managed.

**Scope — choose one:**
- **A (recommended):** implement the S3 adapter with `@aws-sdk/client-s3`, compatible with MinIO;
  keep local disk for development. Cover put/get/stream/exists/delete and key safety.
- **B:** explicitly commit to local disk on a named persistent volume, remove MinIO from the dev
  stack (or label it reserved), and make the backup include the volume.

**Acceptance:**
- Uploads and generated PDFs survive a container replacement.
- The chosen adapter passes the storage tests; `STORAGE_PROVIDER` no longer names an unimplemented
  mode.
- MinIO is either genuinely exercised or removed from the compose file and docs.

**Estimate:** 2 d (A) / 0.5 d (B) · **Depends on:** D3

#### OPS-04 — Backup and restore
**Why:** PRD §57 requires backups; there is no script, schedule or drill.

**Scope:**
- `scripts/backup.sh`: `mysqldump --single-transaction --routines --triggers`, plus the storage
  folder/object prefix; timestamped, checksummed archive; retention policy.
- Schedule (host cron/systemd timer or managed backup), off-host destination, encryption.
- `docs/13-operations.md`: backup, restore, verify, retention, ownership, RPO/RTO.
- Run a **restore drill** into a clean environment.

**Acceptance:**
- A backup taken after a test document is created restores the database and the PDF/attachment
  bytes; the document opens and matches the original.
- Restore procedure is timed and recorded; RPO/RTO are agreed.
- Failure of the backup job is visible (non-zero exit / alert).

**Estimate:** 1.5 d · **Depends on:** OPS-03

#### OPS-05 — Production seed and first-run procedure
**Why:** the seed is idempotent, but a production first run is undocumented and easy to get wrong.

**Scope:**
- Document secret injection for `SEED_*` (never in the image or repo), `prisma migrate deploy`,
  `db:seed`, forced password change, company profile, financial year and numbering setup.
- Add a first-run checklist and a "company is still the placeholder" warning (already in the UI).
- Decide what the seed must **not** create in production (demo customers/items).

**Acceptance:**
- A clean install reaches "first real quotation issued" in under 30 minutes following the doc.
- Seeded users are forced to change passwords; no default password exists anywhere.
- Re-running the seed does not duplicate or reset business data.

**Estimate:** 1 d · **Depends on:** OPS-02

#### SEC-01 — Dependency security upgrade
**Why:** `npm audit --omit=dev` reports 3 critical, 11 high and 6 moderate vulnerabilities.

**Scope:**
- Delete the unused `force` package; this removes `request`, `form-data`, `mime`, `tough-cookie`
  and their advisories.
- Upgrade Express and its transitive stack (`body-parser`, `qs`, `proxy-addr`), `multer`, `axios`,
  `zod`, `puppeteer`/`puppeteer-core`, `react-router`/`react-router-dom`, `exceljs`.
- Treat Zod 4, Express 5 and React Router 7 as **breaking**; do them one at a time behind the test
  suite, not in one lockfile jump.
- Re-run `npm audit --omit=dev` and record accepted residual advisories with a reason.

**Acceptance:**
- No critical or high advisories in production dependencies.
- `npm run verify` passes after each upgrade.
- A short upgrade note records breaking changes and the Node version used.

**Estimate:** 3 d · **Depends on:** CI-01

#### SEC-02 — Production security review
**Why:** Phase 9 explicitly asks for a rate-limit and security-header review; the code has good
primitives but no sign-off.

**Scope:**
- Verify Helmet/CSP, HSTS behind TLS, CORS origins, cookie flags, `trust proxy`, login lockout and
  rate limits (global + auth).
- Add limits where they are missing: report exports, bulk PDF, attachment upload, public share
  route.
- Turn off production source maps; confirm no secrets or stack traces leak in errors.
- Review the `files/:id` route (currently any authenticated user can fetch any file id) and decide
  whether attachment access needs a document permission check.
- Document secret rotation and the `.env`/secret-manager process.

**Acceptance:**
- A written checklist is signed off with evidence (headers, status codes, limits).
- No source map is served in production.
- Rate limits are exercised by a test or a recorded manual check.

**Estimate:** 1 d · **Depends on:** OPS-01

#### CI-01 — Continuous integration and repository hygiene
**Why:** nothing runs automatically; a regression reaches `main` unnoticed.

**Scope:**
- GitHub Actions on **Node 22** (match `.nvmrc`): `npm ci` → `prisma generate` → format check →
  lint → typecheck → test → build → `npm audit --omit=dev`.
- Add `.gitattributes` with `* text=auto eol=lf` and renormalise the working tree.
- Cache npm and Prisma; fail on lockfile drift.
- Decide how npm 11's install-script approval is handled in CI (use Node 22/npm 10, or approve
  Prisma/Puppeteer explicitly).

**Acceptance:**
- A fresh clone on Windows and Linux passes `npm run verify`.
- A pull request cannot merge with a red pipeline.
- The audit step fails on a new critical/high advisory.

**Estimate:** 1 d

#### OBS-01 — Boot-time PDF smoke and readiness
**Why:** `smokeTestRenderer()` exists but is never called; a broken Chromium install is discovered
on the first customer download.

**Scope:**
- Call `smokeTestRenderer()` at boot (non-fatal, logged loudly) or expose it in `/api/health/ready`.
- Keep liveness (`/api/health`) independent of the PDF renderer.
- Include storage reachability in readiness if OPS-03 changes the adapter.

**Acceptance:**
- Booting without Chromium logs a clear error and marks readiness degraded.
- A healthy container proves the renderer works before accepting traffic.

**Estimate:** 0.5 d · **Depends on:** OPS-01

### P1 — Required features and decisions

#### FEAT-01 — Global financial-year selector (Q17)
**Status:** Complete — `FinancialYearProvider`, topbar selector, dashboard/list/report scoping and
export parity are implemented and covered by tests. The customer and monthly-summary report
aggregates carry the year too; neither relies only on a date window.

**Why:** Q17 was decided — "global, defaults to the current FY, with an All option; applies to
dashboard, lists and reports" — but only date filters exist.

**Scope:**
- Add a FY context/provider and a topbar selector with **All**; default to the current FY.
- Persist the choice (localStorage and/or URL) and restore it on reload.
- Apply it consistently to dashboard, quotation list, invoice list, downloads and reports; make
  exports honour the same context.
- Implement the filter server-side (preferred: `financialYearId`; fallback: date window computed
  from the FY) so screen and export cannot disagree.
- Show an explicit "All financial years" state so a user never wonders why an old document is
  missing.

**Acceptance:**
- Switching FY changes every listed screen and its export together.
- "All" shows documents from every FY.
- Reload preserves the selection.
- A document outside the selected FY is visibly explained, not silently hidden.
- Tests cover the context, the API filter and the export parity.

**Estimate:** 2.5 d · **Depends on:** D5

#### FEAT-02 — Document attachments
**Status:** Complete — routes, storage, audit migration, quotation → invoice copy and the detail
panel are implemented and tested.

**Why:** PRD §17 and §21 list Attachments; §58 requires upload validation; `docs/05` already
specifies the endpoints; `FileKind.ATTACHMENT` is reserved but unused.

**Scope:**
- Backend routes for quotations and invoices:
  `GET/POST /:id/attachments`, `DELETE /:id/attachments/:fileId`.
- Reuse `ATTACHMENT_RULES`, `ATTACHMENT_MAX_MB`, magic-byte and extension checks; store as
  `DocumentFile(kind=ATTACHMENT, entityType, entityId)`.
- Permission checks (`quotation.update` / `invoice.update` for writes, `*.read` for reads);
  audit entries for add/remove (requires new `AuditAction` values and a migration).
- Decide conversion behaviour: copy attachments from quotation to invoice, or link explicitly.
- Frontend panel in the editor/detail page: upload, list, download, remove, with size/type errors.
- Consider antivirus scanning (e.g. ClamAV) before accepting attachments; at minimum document the
  residual risk.

**Acceptance:**
- PDF/PNG/JPG/DOCX/XLSX up to 10 MB upload, list, download and delete.
- Executables, mismatched magic bytes and files over the limit are refused with a clear message.
- A Finance Viewer can read/download but cannot add or delete.
- Every add/remove is audited; a deleted attachment leaves the financial document intact.
- The chosen conversion rule is implemented and tested.

**Estimate:** 3.5 d · **Depends on:** D6, D7

#### FEAT-03 — Email sending (only if Q14 is reopened)
**Why:** PRD §31/§68/§77 ask for "send"; Q14 explicitly overrides them. This is **not** pending
unless the product owner changes that decision.

**Scope if approved:** `MailService` + SMTP adapter, email log table, send endpoints, templates,
audit, retry/failure handling, MailHog in dev.

**Estimate:** 4–5 d · **Depends on:** D4

### P2 — Acceptance and quality (Phase 9 exit)

#### QA-01 — Playwright E2E of PRD §77
**Scope:** one spec covering login → customer → quotation → template → items → currency → GST →
preview → PDF → mark accepted → convert → invoice PDF → Finance Viewer view/export/download.
Seed a dedicated test database; clean up after the run.

**Acceptance:** the full path passes in CI against a real MySQL and Chromium, not mocks; a Finance
Viewer is refused every write.

**Estimate:** 3 d · **Depends on:** CI-01, OPS-01

#### QA-02 — Reproducible live-check suite
**Why:** the roadmap claims 39/45/31/33 live checks, but no script exists in the repository, so the
claims cannot be re-run or trusted by the next developer.

**Scope:** commit the integration/live checks against `invoice_db_test`, or replace them with the
E2E suite and a small seed fixture. Document how to run them and what they cover.

**Acceptance:** a new developer can reproduce the roadmap's verification statements from a clean
clone.

**Estimate:** 2 d · **Depends on:** QA-01

#### QA-03 — Performance pass
**Scope:** seed ~5,000 quotations/invoices; measure list, dashboard, report and export timings;
review indexes and query plans; check N+1s; test the 5,000-row CSV/XLSX and 100-PDF ZIP paths; lazy
load frontend routes and disable production source maps.

**Acceptance:** recorded before/after numbers; list and dashboard stay within an agreed budget
(e.g. p95 < 500 ms on the target host); exports stream without memory growth.

**Estimate:** 2 d · **Depends on:** OPS-01

#### QA-04 — Accessibility and responsive review
**Scope:** keyboard navigation, focus management, form labels, table semantics, contrast, empty and
error states, mobile/tablet layout. Fix the highest-impact issues.

**Acceptance:** no critical WCAG A/AA failures on the main flows; a signed manual checklist.

**Estimate:** 2 d

#### DOC-01 — Documentation reconciliation
**Scope:**
- `docs/README.md`: remove "no application code has been written yet".
- `docs/00`, `01`, `05`, `09`, `11`: remove claims for `MailService`, S3, attachments and the FY
  selector where they are not built; mark them reserved/planned.
- `README.md`: add the operations section (deploy, migrate, seed, backup, restore, health, logs,
  rollback).
- Update the roadmap: Phase 9 checklist with real status and links to this plan.
- Record the actual endpoint/feature inventory.

**Acceptance:** every "implemented" claim in the docs can be pointed at code; every planned item is
labelled as such.

**Estimate:** 1 d

#### CFG-01 — Configuration cleanup
**Scope:**
- Remove or wire `FEATURE_PAYMENTS`, `FEATURE_MANUAL_PAYMENTS`, `FEATURE_WHATSAPP`.
- Remove `PDF_ENGINE=playwright` (only Puppeteer is implemented) or implement the alternative.
- Mark `MAIL_PROVIDER`/SMTP as reserved (not active) in `.env.example`.
- Align `engines` with the supported Node line (22 LTS) and CI.
- Decide whether `force` removal belongs here or SEC-01 (it does — keep it in SEC-01).

**Acceptance:** no parsed environment variable or dependency is unused or misleading.

**Estimate:** 0.5 d

---

## 5. Suggested sequence

| Sprint | Goal | Items |
|---|---|---|
| **1 — Clean baseline** | Make the repo trustworthy before changing behaviour | SEC-01 (remove `force` first), CI-01, CFG-01, DOC-01 (quick pass) |
| **2 — Deployable** | A production host, a migration path, storage and backups | OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OBS-01, SEC-02 |
| **3 — Complete** | Close the decided/PRD gaps | FEAT-01, FEAT-02 |
| **4 — Accepted** | Prove the workflow and sign off | QA-01, QA-02, QA-03, QA-04, final PRD §68 walkthrough, docs final pass |

Sprint 1 can run in parallel with the production decisions (D1–D3) because it is mostly independent.

---

## 6. Estimate

| Track | Ideal dev-days |
|---|---|
| P0 — production readiness | ~12.5 |
| P1 — required features | ~6.0 |
| P2 — acceptance and quality | ~10.5 |
| **Total** | **~29** |
| With 20% contingency | **~35** |

At one developer, that is roughly **6–7 weeks**. The P0 track alone is ~2.5 weeks and is the
shortest path to a staging deployment; P1 and P2 can overlap once the environment exists.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Zod 4 / Express 5 / React Router 7 upgrades break code | High churn, subtle behaviour changes | One dependency at a time behind the existing test suite; keep `verify` green; separate PRs |
| Global FY selector changes what users see by default | Old documents appear "missing"; support noise | Default visible label, "All" option, persisted choice, explicit empty state |
| Attachments expand the security surface | Malware, storage growth, data leakage | Type/size/magic checks, permission checks, optional AV scan, retention policy |
| S3 adapter is underestimated | Go-live slips | Local persistent volume is a valid fallback for MVP; decide early (D3) |
| PDF rendering differs in the Linux container | Customer-facing documents wrong | Build container E2E, boot smoke, golden PDF test in CI |
| Backup exists but restore fails | Data loss during an incident | Mandatory restore drill before go-live; record RTO |
| npm 11 blocks install scripts; Node 24 is unsupported | Builds fail on a new machine | CI on Node 22/npm 10; document `prisma generate`; approve scripts explicitly |
| Windows CRLF vs Prettier | `verify` red, noisy diffs | `.gitattributes` + renormalise |
| Production secrets leak into image or logs | Security incident | Secret manager/env injection; review pino redaction; no `.env` in images |
| Phase 7/8 "live checks" are unreproducible | Regressions go unnoticed | QA-02; make the claims executable |

---

## 8. Decisions required before work starts

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Is Phase 9 the next milestone, or do FEAT-01/FEAT-02 come first? | Finish the deployable baseline first; features are safer once staging exists |
| **D2** | Production topology: single Express origin or nginx split? | **Single origin** — built frontend served by Express; cookies already work |
| **D3** | Production storage: S3/MinIO adapter or named local volume? | **S3 adapter** if the host is ephemeral; local volume is acceptable for a single VM |
| **D4** | Does Q14 still stand — no email sending? | **Yes**, keep it out; fix the docs that claim otherwise |
| **D5** | FY selector scope and default | Q17 as written: global, current FY, "All" option, dashboard/lists/reports/exports |
| **D6** | Are attachments in MVP? | **Yes** — PRD §17/§21/§58 and the API spec already require them |
| **D7** | Are quotation attachments copied to the invoice on conversion? | **Copy** them; a customer should not lose the supporting document when the invoice is raised |
| **D8** | Backup RPO/RTO and retention | e.g. nightly backup, 30-day retention, RPO 24 h, RTO 4 h — confirm with the owner |
| **D9** | Domain, TLS termination and secret storage | Decide before OPS-01; TLS at the proxy/load balancer |
| **D10** | Antivirus scanning for attachments? | Optional for MVP, but document the risk; ClamAV sidecar if required |

---

## 9. Definition of done

The pending work is complete when:

- [ ] `npm run verify` is green on a fresh clone on Windows and Linux, and in CI on Node 22.
- [ ] `npm audit --omit=dev` reports no critical or high advisories (accepted residuals documented).
- [ ] A clean Linux host deploys the production build from one documented command; migrations run
      as a release step.
- [ ] Uploads and PDFs survive a container replacement; a backup restores database and storage.
- [ ] The Playwright §77 path passes against a real database and Chromium.
- [ ] A Finance Viewer can view, filter, export and download, and is refused every write.
- [ ] The global FY selector behaves consistently on dashboard, lists, reports and exports.
- [ ] Attachments upload, list, download and delete with validation and audit entries.
- [ ] PRD §68 checklist walked and signed; PRD §77 workflow demonstrated end to end.
- [ ] Documentation matches the code; no doc claims a feature that is not implemented.
- [ ] `docs/09-roadmap.md` Phase 9 is marked complete with evidence.

---

## 10. Quick wins (under a day each)

1. Delete the unused `force` dependency and regenerate the lockfile.
2. Add `.gitattributes` (`* text=auto eol=lf`) and renormalise; `format:check` becomes meaningful.
3. Call `smokeTestRenderer()` at boot and log the result.
4. Add `docs/12-pending-work-plan.md` to `docs/README.md` and fix its "no application code" line.
5. Remove or document the unused feature flags; remove `PDF_ENGINE=playwright`.
6. Turn off production source maps (`build.sourcemap: false`).
7. Lazy-load the route table to cut the 668 kB initial bundle.
8. Add the missing `ATTACHMENT_ADDED` / `ATTACHMENT_REMOVED` audit values in the same migration as
   FEAT-02, rather than a second migration later.
