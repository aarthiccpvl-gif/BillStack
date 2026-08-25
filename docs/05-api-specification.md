# 05 — API Specification

Base path `/api`. JSON only (except file/PDF/export streams). All responses use the envelope from
`00-architecture-overview.md` §6.1.

## 1. Conventions

| Aspect | Convention |
|---|---|
| Auth | httpOnly cookies (`at`, `rt`); every route except `/api/health`, `/api/auth/login`, `/api/auth/refresh` and `/api/public/*` requires a valid access token |
| CSRF | Mutations require header `X-Requested-With: XMLHttpRequest`; cookies are `SameSite=Lax` |
| List params | `?page=1&pageSize=25&sort=-documentDate&search=&status=&customerId=&currencyCode=&dateFrom=&dateTo=&amountMin=&amountMax=&createdById=` |
| Pagination | `meta: { page, pageSize, total, totalPages }`; `pageSize` max 100 (exports bypass paging) |
| Sorting | `sort=field` / `sort=-field`; whitelisted per resource |
| Partial update | `PATCH` with a partial body; `PUT` is not used |
| Idempotency | PDF generation is idempotent per (document, version, templateVersion) — it returns the cached file unless `?force=true` |
| Money | Sent and received as **strings** |
| Dates | `YYYY-MM-DD` for document dates; ISO-8601 UTC for timestamps |
| Errors | See §2 |
| Audit | Every mutation writes an audit row server-side; clients never post audit entries |

## 2. Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Zod failure; `details[]` carries field paths |
| `UNAUTHENTICATED` | 401 | Missing/expired access token |
| `INVALID_CREDENTIALS` | 401 | Login failure (deliberately vague) |
| `ACCOUNT_LOCKED` | 423 | Too many failed logins |
| `FORBIDDEN` | 403 | Authenticated but lacks the permission — **what Finance Viewer receives on every write** |
| `NOT_FOUND` | 404 | Missing or soft-deleted resource |
| `DUPLICATE_RESOURCE` | 409 | Unique constraint (customer code, item code, template key) |
| `DUPLICATE_DOCUMENT_NUMBER` | 409 | Numbering backstop tripped |
| `INVALID_STATUS_TRANSITION` | 422 | e.g. converting an already-converted quotation |
| `BUSINESS_RULE_ERROR` | 422 | Engine guard (no line items, discount > gross, inactive tax rate, closed FY) |
| `IMMUTABLE_RESOURCE` | 422 | Editing a CANCELLED/VOID document or a PUBLISHED template version |
| `CHANGE_REASON_REQUIRED` | 422 | Post-issue edit without a reason |
| `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | 413 / 415 | Upload validation |
| `PDF_GENERATION_FAILED` | 502 | Renderer/Chromium failure |
| `EMAIL_SEND_FAILED` | 502 | Mail provider failure (document state is not corrupted) |
| `RATE_LIMITED` | 429 | Limiter |
| `INTERNAL_ERROR` | 500 | Unexpected |

## 3. Endpoints

Permission column = the key checked by `requirePermission()`. `—` = authenticated only.
FV = Finance Viewer allowed.

### 3.1 System & auth

| Method | Path | Permission | FV | Notes |
|---|---|---|---|---|
| GET | `/api/health` | public | ✓ | DB ping, version, uptime |
| POST | `/api/auth/login` | public | ✓ | Sets `at` + `rt` cookies; audits LOGIN / LOGIN_FAILED |
| POST | `/api/auth/refresh` | public (cookie) | ✓ | Rotates refresh token |
| POST | `/api/auth/logout` | — | ✓ | Revokes the refresh token |
| GET | `/api/auth/me` | — | ✓ | User + role + **permission key array** (drives UI) |
| POST | `/api/auth/change-password` | — | ✓ | Requires current password |

### 3.2 Users & roles

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/users` | `user.read` | ✗ |
| POST | `/api/users` | `user.create` | ✗ |
| GET/PATCH | `/api/users/:id` | `user.read` / `user.update` | ✗ |
| POST | `/api/users/:id/status` | `user.update` | ✗ |
| POST | `/api/users/:id/reset-password` | `user.update` | ✗ |
| GET | `/api/roles` | `role.read` | ✗ |
| GET | `/api/permissions` | `role.read` | ✗ |
| PATCH | `/api/roles/:id/permissions` | `role.update` | ✗ |

### 3.3 Company & configuration

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/company` | `company.read` | ✓ (read-only) |
| PATCH | `/api/company` | `company.update` | ✗ |
| POST | `/api/company/logo` · `/signature` · `/favicon` | `company.update` | ✗ |
| DELETE | `/api/company/logo` | `company.update` | ✗ |
| GET/POST | `/api/company/bank-accounts` | `company.read` / `company.update` | ✓ / ✗ |
| PATCH/DELETE | `/api/company/bank-accounts/:id` | `company.update` | ✗ |
| GET | `/api/settings` | `settings.read` | ✓ |
| PATCH | `/api/settings` | `settings.update` | ✗ |

### 3.4 Masters

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/financial-years` | `master.read` | ✓ |
| POST | `/api/financial-years` | `master.manage` | ✗ |
| POST | `/api/financial-years/:id/close` | `master.manage` | ✗ |
| GET | `/api/currencies` | `master.read` | ✓ |
| POST/PATCH | `/api/currencies` · `/:code` | `master.manage` | ✗ |
| GET | `/api/tax-types` · `/api/tax-rates` · `/api/tax-groups` | `master.read` | ✓ |
| POST/PATCH | same | `master.manage` | ✗ |
| GET | `/api/units` · `/api/item-categories` | `master.read` | ✓ |
| POST/PATCH | same | `master.manage` | ✗ |
| GET | `/api/numbering-series` | `master.read` | ✓ |
| PATCH | `/api/numbering-series/:id` | `master.manage` | ✗ |
| GET | `/api/exchange-rates` | `master.read` | ✓ |
| POST | `/api/exchange-rates` | `master.manage` | ✗ |

### 3.5 Customers

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/customers` | `customer.read` | ✓ |
| POST | `/api/customers` | `customer.create` | ✗ |
| GET | `/api/customers/:id` | `customer.read` | ✓ |
| PATCH | `/api/customers/:id` | `customer.update` | ✗ |
| POST | `/api/customers/:id/archive` | `customer.archive` | ✗ |
| GET | `/api/customers/:id/summary` | `customer.read` | ✓ | totals, outstanding |
| GET | `/api/customers/:id/quotations` · `/invoices` | `customer.read` | ✓ |
| GET/POST | `/api/customers/:id/addresses` | `customer.read` / `customer.update` | ✓ / ✗ |
| PATCH/DELETE | `/api/customers/:id/addresses/:addressId` | `customer.update` | ✗ |
| GET/POST/PATCH | `/api/customers/:id/contacts…` | `customer.read` / `customer.update` | ✓ / ✗ |

### 3.6 Items

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/items` | `item.read` | ✓ |
| POST | `/api/items` | `item.create` | ✗ |
| GET/PATCH | `/api/items/:id` | `item.read` / `item.update` | ✓ / ✗ |
| POST | `/api/items/:id/archive` | `item.archive` | ✗ |

### 3.7 Templates

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/templates?docType=INVOICE` | `template.read` | ✓ |
| POST | `/api/templates` | `template.create` | ✗ |
| GET/PATCH | `/api/templates/:id` | `template.read` / `template.update` | ✓ / ✗ |
| POST | `/api/templates/:id/duplicate` | `template.create` | ✗ |
| POST | `/api/templates/:id/set-default` | `template.update` | ✗ |
| GET | `/api/templates/:id/versions` | `template.read` | ✓ |
| POST | `/api/templates/:id/versions` | `template.update` | ✗ | creates DRAFT v n+1 |
| PATCH | `/api/templates/:id/versions/:v` | `template.update` | ✗ | DRAFT only |
| POST | `/api/templates/:id/versions/:v/publish` | `template.publish` | ✗ |
| POST | `/api/templates/preview` | `template.read` | ✓ | body: `{ templateVersionId? , config?, docType, sampleData? }` → **HTML** |

### 3.8 Quotations

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/quotations` | `quotation.read` | ✓ |
| POST | `/api/quotations` | `quotation.create` | ✗ |
| GET | `/api/quotations/:id` | `quotation.read` | ✓ |
| PATCH | `/api/quotations/:id` | `quotation.update` | ✗ | `changeReason` required once past DRAFT |
| DELETE | `/api/quotations/:id` | `quotation.delete` | ✗ | DRAFT only, soft delete |
| POST | `/api/quotations/:id/duplicate` | `quotation.create` | ✗ |
| POST | `/api/quotations/:id/status` | `quotation.update_status` | ✗ | `{ status, reason? }` |
| POST | `/api/quotations/:id/status` (→ `SENT`) | `quotation.update_status` | ✗ | Marks as sent; **no email is sent** (decision Q14) |
| POST | `/api/quotations/:id/convert` | `quotation.convert` | ✗ | → `{ invoiceId, number }` |
| POST | `/api/quotations/preview` | `quotation.read` | ✓ | unsaved payload → HTML |
| POST | `/api/quotations/:id/pdf` | `quotation.read` | ✓ | generate/refresh, returns file meta |
| GET | `/api/quotations/:id/pdf?version=n` | `quotation.download` | ✓ | streams PDF, audits download |
| GET | `/api/quotations/:id/history` | `quotation.read` | ✓ | revisions + audit trail |
| GET | `/api/quotations/:id/versions/:v` | `quotation.read` | ✓ | historical snapshot |
| POST | `/api/quotations/:id/share-link` | `quotation.share` | ✗ | returns opaque URL |
| GET/POST/DELETE | `/api/quotations/:id/attachments…` | `quotation.read` / `quotation.update` | ✓ / ✗ |

### 3.9 Invoices

Identical surface with `invoice.*` permissions, minus `convert`, plus:

> **Decision Q14 — download only.** There is no `POST .../send` endpoint anywhere in this API. Sharing
> is: generate PDF → download, or create a secure share link (and optionally open a `wa.me` deep link).
> `SENT` is a manual status change recording who marked it and when.

| Method | Path | Permission | FV |
|---|---|---|---|
| POST | `/api/invoices/:id/issue` | `invoice.update_status` | ✗ | DRAFT → ISSUED |
| POST | `/api/invoices/:id/cancel` | `invoice.cancel` | ✗ | `{ reason }` (required) |
| POST | `/api/invoices/:id/void` | `invoice.void` | ✗ |
| POST | `/api/invoices/:id/payment-status` | `payment.status_update` | ✗ | `{ status, amountPaid, paymentReference? }` — manual, no ledger (decision Q2) |

### 3.10 Dashboard, reports, exports, audit

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/dashboard/summary` | `dashboard.read` | ✓ | KPI cards |
| GET | `/api/dashboard/charts?range=FY` | `dashboard.read` | ✓ | monthly series, conversion funnel |
| GET | `/api/dashboard/recent-documents` | `dashboard.read` | ✓ |
| GET | `/api/reports/quotations` · `/invoices` · `/customers` · `/summary` | `report.read` | ✓ |
| GET | `/api/export/quotations?format=csv\|xlsx\|pdf` | `report.export` | ✓ | honours all list filters |
| GET | `/api/export/invoices?format=…` · `/customers` · `/audit` | `report.export` | ✓ |
| POST | `/api/export/documents/bulk-pdf` | `document.bulk_download` | ✓ | `{ type, ids[] }` → ZIP stream |
| GET | `/api/audit-logs` | `audit.read` | ✓ | filter by user/action/entity/date |
| GET | `/api/audit-logs/:entityType/:entityId` | `audit.read` | ✓ |
| GET | `/api/search?q=` | — | ✓ | documents, customers, items (permission-filtered) |

### 3.11 Files & public share

| Method | Path | Permission | FV |
|---|---|---|---|
| GET | `/api/files/:id` | resource-derived | ✓ | streams with `Content-Disposition`; ownership/permission checked per `entityType` |
| GET | `/api/public/documents/:token` | public | — | rate-limited; records a view (drives `VIEWED`) |
| GET | `/api/public/documents/:token/pdf` | public | — | streams the stored PDF only |

The public route is deliberately minimal: opaque 32-byte token, hashed at rest, optional expiry, no
customer PII in the URL, revocable, and it can only ever read an already-generated PDF — never the API.

## 4. Request/response example

`POST /api/invoices`

```json
{
  "customerId": 12,
  "documentDate": "2026-08-24",
  "dueDate": "2026-09-23",
  "paymentTermsDays": 30,
  "currencyCode": "USD",
  "exchangeRateToBase": "83.4200",
  "referenceNumber": "PO-4471",
  "placeOfSupplyStateCode": "OTH",
  "billingAddressId": 34,
  "shippingAddressId": 34,
  "templateId": 1,
  "bankAccountId": 2,
  "discountMode": "PERCENT",
  "discountValue": "5",
  "adjustment": "0",
  "items": [
    { "itemId": 7, "name": "Website Development", "description": "Phase 1",
      "quantity": "1", "rate": "5000.0000", "unitCode": "LOT",
      "discountMode": "NONE", "discountValue": "0", "taxGroupId": 9, "hsnSacCode": "998314" }
  ],
  "notes": "Thank you for your business.",
  "terms": "Payment due within 30 days.",
  "showBankDetails": true
}
```

Note what is **absent**: `number`, `subtotal`, `taxTotal`, `grandTotal`, `status`,
`financialYearId`, `taxSummary`. All are server-derived. The response returns the full computed
document including the assigned number and every total as strings.

## 5. Transaction boundaries

`POST/PATCH` on a document runs a single Prisma `$transaction`:

```text
1  validate payload (zod)                       6  insert/replace line items + item taxes
2  load & lock numbering (create only)          7  write revision row (post-DRAFT edits)
3  resolve financial year                       8  write audit row
4  snapshot customer/company/currency/template  9  commit
5  CalculationService.compute()                10  post-commit: invalidate cached PDF, queue no I/O
```

Nothing that can fail slowly (PDF, email, storage) happens inside the transaction. PDF generation and
sending are separate, retryable calls, so a Chromium hiccup can never leave a half-written invoice.
