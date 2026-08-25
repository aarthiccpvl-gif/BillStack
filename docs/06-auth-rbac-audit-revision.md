# 06 — Authentication, RBAC, Audit & Revision

## 1. Authentication

**Chosen scheme: JWT in httpOnly cookies with a rotating refresh token.**

```text
POST /api/auth/login
  → verify email + password (argon2id via @node-rs/argon2)
  → issue access JWT  (15 min, cookie "at",  httpOnly, SameSite=Lax, Secure in prod, path=/api)
  → issue refresh JWT (7 days, cookie "rt", httpOnly, path=/api/auth)
  → store SHA-256(refresh) in refresh_tokens
  → audit LOGIN

POST /api/auth/refresh
  → verify rt cookie + hash exists + not revoked/expired
  → revoke old row, issue new pair, link replacedById   (rotation + reuse detection)
  → reuse of a revoked token ⇒ revoke the whole family and force re-login

POST /api/auth/logout → revoke row, clear cookies, audit LOGOUT
```

Why cookies rather than `localStorage` bearer tokens: an XSS bug in an internal finance app should not
hand out a bearer token. httpOnly cookies plus a `X-Requested-With` header check plus `SameSite=Lax`
covers XSS-exfiltration and CSRF without a session store. In development the Vite proxy makes the API
same-origin, so cookies work without CORS gymnastics.

Access-token claims: `{ sub, roleKey, tokenVersion, iat, exp }`. Permissions are **not** in the token
— they are loaded per request from a small in-memory cache (invalidated on role/permission change),
so a permission revocation takes effect immediately rather than after 15 minutes.

Hardening:

- Password policy: min 10 chars, mixed classes, checked against a small common-password list.
- `failedLoginCount` + `lockedUntil` (5 attempts → 15 min lock), plus an IP rate limiter on login.
- `mustChangePassword` on seeded/reset accounts, enforced by a middleware that allows only
  `/auth/me`, `/auth/change-password`, `/auth/logout` until cleared.
- Seed credentials come only from `SEED_*` env vars, are never written to source, and are never logged.
- `tokenVersion` on the user lets an admin invalidate all of a user's sessions.

## 2. Authorization model

Three layers, all mandatory:

```text
1  requireAuth        — valid access token, user ACTIVE
2  requirePermission('invoice.create')  — route-level check against role_permissions
3  service-level assertions             — status machine, ownership, business rules
```

Layer 2 is generated from a single route table, so a new route without a declared permission fails a
startup assertion — it is impossible to ship an unprotected mutating route by forgetting a decorator.

An extra global guard makes the Finance Viewer requirement structural rather than incidental: for any
role flagged `isReadOnly`, a middleware rejects every non-GET/HEAD request with `FORBIDDEN` before it
reaches a controller. Even a future route that forgot its permission declaration stays safe.

## 3. Permission catalogue

```text
dashboard.read
customer.read      customer.create   customer.update   customer.archive
item.read          item.create       item.update       item.archive
master.read        master.manage
company.read       company.update
settings.read      settings.update
template.read      template.create   template.update   template.publish
quotation.read     quotation.create  quotation.update  quotation.delete
quotation.update_status  quotation.send  quotation.convert  quotation.share
quotation.download
invoice.read       invoice.create    invoice.update    invoice.delete
invoice.update_status    invoice.send    invoice.cancel     invoice.void
invoice.share      invoice.download
payment.record                                   (flag-gated)
document.bulk_download
report.read        report.export
audit.read
user.read          user.create       user.update
role.read          role.update
```

## 4. Role → permission matrix

| Permission group | SUPER_ADMIN | ADMIN | FINANCE_VIEWER |
|---|:--:|:--:|:--:|
| dashboard.read | ✓ | ✓ | ✓ |
| customer.read / item.read / master.read | ✓ | ✓ | ✓ |
| customer.create/update, item.create/update | ✓ | ✓ | — |
| customer.archive / item.archive | ✓ | ✓ | — |
| master.manage (currencies, taxes, units, FY, numbering) | ✓ | — | — |
| company.read / settings.read | ✓ | ✓ | ✓ (read) |
| company.update / settings.update | ✓ | — | — |
| template.read | ✓ | ✓ | ✓ |
| template.create/update/publish | ✓ | — ¹ | — |
| quotation.read / invoice.read | ✓ | ✓ | ✓ |
| quotation.create/update, invoice.create/update | ✓ | ✓ | — |
| quotation.update_status / invoice.update_status | ✓ | ✓ | — |
| quotation.share / invoice.share | ✓ | ✓ | — |
| quotation.convert | ✓ | ✓ | — |
| quotation.delete / invoice.delete (DRAFT only) | ✓ | — ¹ | — |
| invoice.cancel / invoice.void | ✓ | — ¹ | — |
| quotation.share / invoice.share | ✓ | ✓ | — |
| *.download / document.bulk_download | ✓ | ✓ | ✓ |
| report.read / report.export | ✓ | ✓ | ✓ |
| payment.status_update | ✓ | ✓ | — |
| audit.read | ✓ | ✓ ² | ✓ ² |
| user.* / role.* | ✓ | — | — |

¹ **Confirmed (decision Q6): Super Admin only.** Template management, invoice cancellation and
voiding, and draft deletion sit with Super Admin, matching PRD §5.1/§5.2. Because permissions are
rows, moving any of them to Admin later is a seed change, not a deployment.
² PRD §5.3 grants Finance Viewer "view audit history"; Admin is only barred from *deleting* audit
logs. No role can ever mutate audit rows — there is no such endpoint.

Because permissions are rows, this matrix is data. Moving `template.update` to ADMIN later is a seed
change, not a code change.

## 5. Status machines

Enforced centrally by `StatusService.assertTransition(docType, from, to)`.

**Quotation**

```text
DRAFT     → SENT, CANCELLED, (deleted while DRAFT)
SENT      → VIEWED, ACCEPTED, DECLINED, EXPIRED, CANCELLED
VIEWED    → ACCEPTED, DECLINED, EXPIRED, CANCELLED
ACCEPTED  → CONVERTED, CANCELLED
DECLINED  → (terminal; may be re-SENT after edit)
EXPIRED   → SENT (after revising the expiry date), CANCELLED
CONVERTED → (terminal)
CANCELLED → (terminal)
```

`VIEWED` is set automatically when the recipient opens a share link (`document_shares.viewCount`
increments and `firstViewedAt` is stamped once). `EXPIRED` is derived on read *and* stamped by a
lightweight daily job, so lists and KPIs agree.

**Invoice**

```text
DRAFT           → ISSUED, CANCELLED, (deleted while DRAFT)
ISSUED          → SENT, PARTIALLY_PAID, PAID, CANCELLED, VOID
SENT            → VIEWED, PARTIALLY_PAID, PAID, CANCELLED, VOID
VIEWED          → PARTIALLY_PAID, PAID, CANCELLED, VOID
PARTIALLY_PAID  → PAID, VOID
PAID            → VOID (rare, requires reason)
OVERDUE         -- derived flag, not a stored terminal state
CANCELLED/VOID  → (terminal, read-only)
```

`OVERDUE` is computed (`status ∈ {ISSUED,SENT,VIEWED,PARTIALLY_PAID} AND dueDate < today`) rather
than stored, so it can never go stale. `PAID`/`PARTIALLY_PAID` are driven by payment records if the
manual-payments flag is on, otherwise set manually by an authorised user (PRD §22 allows this).

## 6. Revision history

**Trigger rule (proposed):** a revision row is written on every update **after the document leaves
DRAFT**. Edits while still DRAFT are audited but do not create versions — otherwise a user typing a
quotation over ten saves generates ten meaningless "versions".

```text
Invoice INV-2026-0015
  currentVersion = 3
  invoice_revisions:
    v1  changedBy=asha  reason="Client requested extra licence"   prev={…$1,500}  new={…$1,650}
    v2  changedBy=asha  reason="Rate correction"                  prev={…$1,650}  new={…$1,700}
```

Semantics:

- `currentVersion` starts at 1 when the document is issued. Version *n* row records the transition
  **into** version *n+1*; `previousDataJson` is the full pre-edit snapshot, `newDataJson` the post-edit
  snapshot — so any historical state can be reconstructed without replaying diffs.
- Snapshot = the same `DocumentData` contract used for rendering, so **any old version can be
  re-rendered to PDF exactly as it was**, using its own `templateVersionId`.
- `diffSummaryJson` holds a human-readable field list (`["grandTotal", "items[2].rate"]`) for the
  history UI.
- `changeReason` is **required** for post-issue edits (`CHANGE_REASON_REQUIRED` if missing), optional
  otherwise.
- Rows are append-only: no update or delete path exists, and generated PDFs are retained per version
  (`document_files.documentVersion`).
- The history UI offers *view version*, *download that version's PDF*, and *compare with current*.
  **Restore is deliberately not offered** in MVP — restoring is just a normal edit that produces a new
  version, which keeps the chain honest.

`RevisionService.record({ entityType, entityId, before, after, actor, reason })` is generic, so
quotations and invoices share one implementation.

## 7. Audit logging

Every mutating service call writes one audit row inside the same transaction as the change, using the
`AsyncLocalStorage` request context for `userId`, `ip`, `userAgent`, `requestId`. Read actions are
audited selectively — `DOCUMENT_DOWNLOADED`, `DOCUMENT_SHARED`, `REPORT_EXPORTED`, `BULK_DOWNLOAD`
(all listed in the brief §15) — because auditing every GET would bury the signal.

| Field | Source |
|---|---|
| `userId`, `userEmailSnapshot` | request context (email snapshotted so audit survives user changes) |
| `action` | `AuditAction` enum (full list in `02-prisma-schema-design.md`) |
| `entityType`, `entityId`, `entityLabel` | e.g. `INVOICE`, `1042`, `"INV-2026-0015"` |
| `ip`, `userAgent`, `requestId` | request context |
| `previousDataJson`, `newDataJson` | redacted diff — never password hashes, tokens or file bytes |
| `metadataJson` | contextual extras (recipients on send, format on export, filters used) |
| `createdAt` | server time |

Guarantees: no update/delete endpoints; immutability additionally enforceable at the DB level by
granting the application user only `INSERT`/`SELECT` on `audit_logs`; failure to write an audit row
fails the transaction (auditing is not best-effort); logs are exportable but never purged (PRD §41).

## 8. Test plan for this area

- Login: valid, wrong password, unknown email, inactive user, locked user, lockout threshold, refresh
  rotation, reuse of a revoked refresh token, logout invalidation.
- RBAC matrix test: a table-driven suite iterating **every** route × three roles, asserting
  200/403 against the matrix above — this is the regression net for "Finance Viewer must be read-only".
- Finance Viewer specifically: `POST/PATCH/DELETE` on invoices, quotations, customers, items,
  templates, settings, users, plus `convert` and `send` → all 403; `GET` + export + download → 200.
- Revision: two sequential post-issue edits produce v1 and v2 with intact prior snapshots; a
  post-issue edit without `changeReason` is rejected; a DRAFT edit creates no revision.
- Audit: every mutation produces exactly one row with correct actor/entity; no endpoint can modify
  `audit_logs`.
