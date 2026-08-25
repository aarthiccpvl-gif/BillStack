# 11 — Decision Log

Decisions taken by the product owner on 2026-08-24, closing every question raised in
[10-open-questions.md](10-open-questions.md). This file is authoritative where it disagrees with an
earlier document; the affected documents have been updated to match.

## Decisions

| # | Question | Decision | Consequence |
|---|---|---|---|
| Q1 | Document numbering format | **`FT001/2026-2027`** | New pattern and a new `{FY_LONG}` token; padding 3. See §1 below. |
| Q2 | Payment tracking | **Admin manually changes payment status** | No payments ledger. See §2. |
| Q3 | Consolidated reporting | **INR base currency + manually entered exchange rate** | `exchangeRateToBase`, `baseTotal` per document; reports show per-currency and base totals. |
| Q4 | Issued documents | **Currency, document date and financial year lock on issue** | Everything else stays editable, with a revision and a reason. |
| Q5 | Document discount | **Applied before tax** | Reduces taxable value, allocated across lines by largest remainder. |
| Q6 | Permission split | **Super Admin holds the higher-level permissions** | Templates, cancel/void, draft delete, company settings and masters are Super Admin only. |
| Q7 | Number assignment | **On first save** | Visible while drafting; abandoned drafts leave auditable gaps. |
| Q8 | Draft deletion | **Soft delete** | `deletedAt`, restricted permission, audited; the number is never reused. |
| Q9 | Share links | **Yes — opaque token, 30-day default TTL, revocable** | Powers the `VIEWED` status and PDF-only public access. |
| Q10 | HSN/SAC | **Yes**, with an optional HSN-wise tax summary | On items and on every document line. |
| Q11 | Renderer | **React SSR in the backend** | Composable blocks, snapshot-testable, one HTML for preview and PDF. |
| Q12 | Upload limits | **Logo ≤ 5 MB (PNG/JPG/SVG), attachments ≤ 10 MB (PDF/PNG/JPG/DOCX/XLSX)** | Magic-byte validation; SVG sanitised on upload. |
| Q13 | Signature | **User-uploaded signature *and* company seal, each with its own area on the document** | Two image slots, two template blocks. See §3. |
| Q14 | Sending | **Download only — no email sending in this project** | Significant scope change. See §4. |
| Q15 | Development email | **MailHog** | Kept for the future; nothing is emailed in the MVP. |
| Q16 | Deployment | **Docker on Linux** | Settles the Chromium packaging for the PDF renderer. |
| Q17 | Financial year selector | **Global, defaults to the current FY, with an "All" option** | Applies to dashboard, lists and reports. |

---

## 1. Document numbering — `FT001/2026-2027`

```text
pattern  {PREFIX}{SEQ}/{FY_LONG}
prefix   FT
padding  3
reset    every financial year
result   FT001/2026-2027 · FT002/2026-2027 … FT001/2027-2028
```

New token added to the numbering engine:

| Token | FY 2026-27 |
|---|---|
| `{FY_LONG}` | `2026-2027` (both years in full — the format chosen here) |
| `{FY_FULL}` | `2026-27` (still available) |
| `{FY_SHORT}` | `26-27` |
| `{FY_START}` / `{FY_END}` | `2026` / `2027` |

**Open assumption (non-blocking):** the answer specified one format without distinguishing the two
document types. Quotations are seeded as **`QT001/2026-2027`** — same shape, different prefix, so a
quotation number can never be mistaken for an invoice number. Both series are editable in
Administration → Masters & Numbering, so changing the quotation prefix (or making both `FT`) is a
settings change, not a code change. Flag it if the quotation series should read differently.

## 2. Payment tracking — status only, no ledger

The decision is that an Admin **manually changes the payment status**, so no `invoice_payments`
table is built. To keep `PARTIALLY_PAID` and "Outstanding Amount" meaningful without a ledger, the
invoice carries a single `amountPaid` column that the Admin can set alongside the status:

```text
outstanding = grandTotal − amountPaid
PAID            → amountPaid defaults to grandTotal
PARTIALLY_PAID  → amountPaid required, must be > 0 and < grandTotal
```

Every change is audited (`PAYMENT_STATUS_CHANGED`) with the previous and new values, and on an
issued invoice it also creates a revision. A full payments ledger remains a clean future addition —
the column becomes a derived total at that point.

## 3. Signature and seal

Two independent uploads, both managed in Company Settings and both with a dedicated area on the
document:

| Asset | Storage | Template block |
|---|---|---|
| Authorised signature | `company_settings.signatureFileId` | signature area, above the signatory label |
| Company seal / stamp | `company_settings.sealFileId` | seal area, beside the signature |

Each can be shown or hidden per template, and each has its own size and position setting. The
template config gains `sections.seal` and `branding.seal`.

## 4. Sending — download only

**Email sending is out of scope for this project.** This overrides PRD §31 ("Email"), PRD §54
(`POST /api/quotations/:id/send`) and the brief's "Send" action.

What sharing means instead:

```text
Download PDF
Copy secure share link   (opaque token, 30-day TTL, revocable, PDF only)
Open WhatsApp with the share link pre-filled   (wa.me deep link, no API integration)
Mark as sent             (a manual status change, recording who and when)
```

Consequences:

- No `POST .../send` endpoint, no compose-email dialog, no `email_messages` table in the MVP.
- `SENT` remains a real status, set manually when the document has been given to the customer.
- `VIEWED` is still driven by the share link's view counter.
- `MailService`, its SMTP adapter and MailHog stay in the architecture as an unused extension point,
  so adding email later is configuration plus one service call — not a redesign.
- `mail` environment variables remain in `.env.example`, marked as reserved.

---

## Documents updated to match

- [04-numbering-financial-year.md](04-numbering-financial-year.md) — new default pattern and `{FY_LONG}` token
- [02-prisma-schema-design.md](02-prisma-schema-design.md) — `invoice_payments` and `email_messages` removed from MVP; `amountPaid`, `sealFileId` added
- [05-api-specification.md](05-api-specification.md) — send endpoints replaced by mark-as-sent, share link and download
- [06-auth-rbac-audit-revision.md](06-auth-rbac-audit-revision.md) — role matrix fixed to the Q6 split
- [07-template-pdf-engine.md](07-template-pdf-engine.md) — seal block and config keys
- [09-roadmap.md](09-roadmap.md) — Phase 5/6 scope adjusted for download-only sharing
