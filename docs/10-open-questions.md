# 10 — Contradictions, Gaps, Risks & Decisions Needed

## A. Contradictions found between the PRD and the development brief

| # | Contradiction | Resolution taken |
|---|---|---|
| C1 | PRD §9 numbers invoices `INV-0001` (no year); PRD §10 and brief §7 use `INV-2026-0001` | Numbering is a configurable pattern; default `INV-{FY_START}-{SEQ}` → `INV-2026-0001`. Either style is reachable without code changes. See Q1. |
| C2 | PRD §5.1 lists template management, invoice cancellation and deletion under **Super Admin only**; brief §12 says "Admin should be able to customize templates" | Permission-based RBAC: those permissions sit with SUPER_ADMIN by default, and moving them to ADMIN is a seed/data change. See Q6. |
| C3 | PRD §22 requires `PAID`, `PARTIALLY_PAID`, `OVERDUE` and §12 requires "Outstanding Amount", but payments are out of scope and no payment table is listed in §51 | Proposed a minimal manual `invoice_payments` table behind `FEATURE_MANUAL_PAYMENTS` (no gateway — that stays excluded). Without it those KPIs cannot be truthful. **Blocking — Q2.** |
| C4 | Multi-currency (§32) plus consolidated KPIs and "Total Invoice Value" (§7) and a monthly summary (§37) — summing INR and USD is meaningless | Added `exchangeRateToBase` + `baseTotal` per document and a company `baseCurrencyCode`; reports show per-currency **and** base-currency roll-ups. **Blocking — Q3.** |
| C5 | §23 wants freely editable issued documents; §41 wants permanent retention and immutable history | Revisions, not immutability: the row is editable, every version is preserved with reason/actor, and each version keeps its own PDF. Terminal states (CANCELLED/VOID) become read-only. See Q4. |
| C6 | §18/§59 include a `VIEWED` status, but the customer portal and read-receipts are out of scope | `VIEWED` is driven by the secure share link (`document_shares` view counter). Without share links it can only be set manually. See Q9. |
| C7 | §16 shows a document-level discount and tax of ₹17,100 on a ₹95,000 taxable value, but never states the order of operations | Discount is applied **before** tax (GST-correct, and consistent with the PRD's own numbers), allocated proportionally to lines. See Q5. |
| C8 | §51 lists `customer_addresses` while §52 lists `billing_address`/`shipping_address` inline on `customers` | Both: normalised addresses in the master, frozen JSON snapshots on each document. |
| C9 | §51 lists generic `documents` / `document_files` tables alongside `quotations`/`invoices` | Kept `quotations` and `invoices` as the document tables; `document_files` holds attachments and generated PDFs. A third generic table would only add indirection. |
| C10 | Brief §30 says "no duplicated quotation/invoice logic" while the PRD prescribes separate tables | Separate tables, shared services and one generic editor component. |

## B. Requirements missing from the PRD that this design adds

| # | Gap | Why it matters | Proposal |
|---|---|---|---|
| G1 | **HSN/SAC codes** are never mentioned | An Indian GST invoice is legally expected to carry HSN (goods) / SAC (services) codes per line; a "GST-ready" system without them will need a schema change later | `items.hsnSacCode` + a snapshot on each line + an optional column and HSN-wise tax summary in templates. **Q10** |
| G2 | **Place of supply / state codes** | CGST+SGST vs IGST cannot be determined without the company state and the customer's place of supply | `company_settings.stateCode`, `customers.placeOfSupplyStateCode`, editable per document, with an auto-suggest engine |
| G3 | **Rounding & round-off** rules undefined | Indian invoices normally round to the nearest rupee, shown as a separate line | HALF_UP throughout; separate `roundOff` column distinct from the manual `adjustment`; configurable on/off |
| G4 | **Amount in words** | Expected on virtually every Indian invoice | Generated per currency, stored in the tax-summary snapshot, toggleable per template |
| G5 | **Numbering concurrency** | Two users saving at once could duplicate a number | `document_sequences` + `SELECT … FOR UPDATE` + unique index backstop |
| G6 | **Send history & share links** | "Sent" status and the audit trail need records of what was emailed/shared to whom | `email_messages`, `document_shares` |
| G7 | **Multiple bank accounts** | A USD invoice usually needs a different account than an INR one | `company_bank_accounts` with a default, selectable per document |
| G8 | **Custom fields** are listed but never defined | Avoids a schema change later | `customFieldsJson` on documents now; a definitions master only if it is actually needed |
| G9 | **Tax groups** | Selecting "GST 18%" must expand to CGST 9% + SGST 9% on the line | `tax_groups` / `tax_group_rates` |
| G10 | **Units master** | §13 has a `unit` field with no vocabulary; free text drifts ("hrs", "Hrs", "hour") | Seeded `units` master |
| G11 | **Password/session policy, lockout** | §57 says "secure authentication" without specifics | Documented in `06-auth-rbac-audit-revision.md` §1 |
| G12 | **Attachment limits & allowed types** | §58 says validate, without values | `UPLOAD_MAX_MB=5` (images), `ATTACHMENT_MAX_MB=10`; PNG/JPG/SVG for logos, PDF/PNG/JPG/DOCX/XLSX for attachments; SVG sanitised or stored non-inline. **Q12** |
| G13 | **Backup/restore runbook** | §57 lists database backups as a requirement but no owner or procedure | Phase 9 deliverable: documented `mysqldump` + storage-folder backup and a restore drill |

## C. Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Puppeteer/Chromium packaging (Windows dev vs Linux container) — different fonts, missing libs | PDFs differ between environments, or fail in production | Self-hosted fonts embedded as data URIs; fully self-contained HTML (no network at render time); Chromium deps pinned in `backend.Dockerfile`; boot-time smoke render; golden-PDF assertions in CI |
| Preview/PDF divergence | Loss of trust in the whole feature | One renderer, one HTML, used by both paths — enforced architecturally, and tested |
| Decimal drift between the frontend preview and the backend total | Users see a total that changes after saving | Single shared decimal engine + shared fixtures asserted on both sides; money never touches `number` |
| Multi-currency reporting without FX | Meaningless consolidated figures | `baseTotal` per document; reports label the currency basis explicitly |
| Post-issue editing of GST invoices | Under Indian GST, an issued invoice is normally amended via a credit/debit note, not edited. The PRD explicitly wants editing, which is fine for an internal system, but the printed history of a *sent* invoice can then differ from what the customer holds | Full revision history with reasons, per-version PDFs, and an audit trail; `CREDIT_NOTE` reserved in the enums so the compliant path can be added later. Flagged for awareness, not blocking. |
| Template config sprawl (a WYSIWYG-by-request creep) | Unbounded scope | Config is a closed, validated schema; new layouts are code, not user-authored HTML |
| MySQL JSON snapshots growing | Table bloat over years | Snapshots are small (a few KB); revisions are the only multiplier, and retention is a stated requirement. Revisit archival if `*_revisions` passes millions of rows |
| Timezone/date handling | An invoice dated 31 March landing in the wrong financial year | `DATE` columns for document dates; FY resolved from the document date; `TZ` pinned |
| Bulk export/download memory | 5,000-row exports or 100-PDF ZIPs blowing heap | Streamed CSV/XLSX/ZIP writers; a hard cap with a clear error above it |

## D. Decisions needed before Phase 1

Blocking ones are marked **B** — I need an answer to proceed correctly. The rest have a stated default
I will proceed with unless told otherwise.

| # | Question | My recommendation |
|---|---|---|
| **Q1** | Numbering format: `INV-2026-0001` (FY start year) — confirm, and confirm padding 4 and separate `QT-`/`INV-` series | Default as shown; configurable in the UI |
| **Q2 B** | Allow **manual** payment recording (no gateway) so `PAID` / `PARTIALLY_PAID` / `OVERDUE` and "Outstanding Amount" are real? | **Yes** — a small `invoice_payments` table, admin-entered. Otherwise those KPIs must be removed from the dashboard and customer page |
| **Q3 B** | Base currency for consolidated reporting = **INR**, with a manually entered exchange rate per foreign-currency document (default 1.0)? | Yes; reports show per-currency and base-currency totals |
| **Q4** | After issue: freeze `currency`, `document date` and `financial year` while allowing everything else to be edited? | Yes — changing the currency or FY of an issued document invalidates its number and history |
| **Q5** | Confirm the document-level discount reduces taxable value (applied **before** tax) | Yes, per the PRD's own §16 numbers |
| **Q6 B** | Which permissions belong to ADMIN vs SUPER_ADMIN: template create/edit/publish, invoice cancel/void, draft delete, company settings? | Per PRD §5.1/§5.2: Super Admin only. Easy to change — it is seed data |
| **Q7** | Assign the document number at first save (visible in the create screen, gaps possible from abandoned drafts) or on issue (gapless, but the number changes)? | First save, soft-delete only, gaps reported in the audit report |
| **Q8** | Are DRAFT documents deletable at all (soft delete), or should they only ever be cancelled? | Soft delete for drafts, restricted permission, fully audited |
| **Q9** | Are public secure share links acceptable (opaque token, optional expiry, revocable, PDF-only)? This is what makes `VIEWED` real | Yes, with a 30-day default TTL |
| **Q10** | Add HSN/SAC to items and invoice lines, with an HSN-wise tax summary option in templates? | Yes — cheap now, painful later |
| **Q11** | Renderer implementation: React SSR in the backend (my recommendation) or a string template engine (Eta/Handlebars)? | React SSR — shared types, composable blocks, snapshot-testable |
| **Q12** | Upload limits/types: logo ≤ 5 MB (PNG/JPG/SVG), attachments ≤ 10 MB (PDF/PNG/JPG/DOCX/XLSX)? Is SVG required, given it needs sanitising? | As listed; drop SVG if PNG is acceptable |
| **Q13** | Signature: an uploaded image at company level, or per user? | Company-level image + optional printed name label |
| **Q14** | Is `ISSUED` a distinct step from `SENT` for invoices (issue now, email later), or should saving a non-draft invoice mean issued? | Keep them distinct — finance teams often issue then send |
| **Q15** | Email in development: MailHog (nothing leaves the machine). For production, which SMTP/provider and which `From` address? | MailHog for dev; provider configured later purely through env vars |
| **Q16** | Deployment target for Phase 9 (Windows Server / Linux VM / Docker on-prem)? Affects the Chromium packaging and the backup runbook | Docker on Linux, if the choice is open |
| **Q17** | Should the FY selector in the topbar filter the whole application by default (dashboard, lists, reports) to the current FY? | Yes — default to the current FY with an "All" option |
