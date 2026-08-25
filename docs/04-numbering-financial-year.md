# 04 — Financial Year & Document Numbering

## 1. Financial year

- Configurable start month in `company_settings.financialYearStartMonth`, default **4** (April) —
  so India's 1 Apr → 31 Mar is the default, not a hard-coded assumption.
- `financial_years` rows: `code`, `startDate`, `endDate`, `isCurrent`, `status` (OPEN/CLOSED).
- `FinancialYearService`:
  - `resolveForDate(date)` → the FY row containing that date, **auto-creating** it if missing
    (inside the same transaction as document creation, so 1 April never fails).
  - `getCurrent()` → the FY containing today.
  - `close(fyId)` → marks CLOSED. Closing is advisory in MVP (it warns on new documents dated into a
    closed year) rather than blocking, because the PRD allows post-issue edits.
- Every quotation and invoice stores `financialYearId`, assigned from the **document date**, not from
  the creation timestamp. Back-dating an invoice into the previous FY therefore numbers it in that
  FY's series — which is the behaviour a finance team expects.

## 2. Numbering configuration

`numbering_series` (one active row per document type):

| Column | Example | Meaning |
|---|---|---|
| `docType` | `INVOICE` | QUOTATION · INVOICE · (CREDIT_NOTE reserved) |
| `prefix` | `INV` | |
| `pattern` | `{PREFIX}{SEQ}/{FY_LONG}` | Token template |
| `padding` | `3` | Zero-padding for `{SEQ}` |
| `startNumber` | `1` | First sequence value in each new FY |
| `resetPolicy` | `FINANCIAL_YEAR` | or `NEVER` (continuous) |
| `isActive` | `true` | |

Supported tokens:

| Token | For FY 2026-27, seq 15 | Notes |
|---|---|---|
| `{PREFIX}` | `INV` | |
| `{FY_START}` | `2026` | FY start calendar year |
| `{FY_END}` | `2027` | |
| `{FY_SHORT}` | `26-27` | |
| `{FY_FULL}` | `2026-27` | |
| `{FY_LONG}` | `2026-2027` | both years in full — used by the chosen default |
| `{YYYY}` `{YY}` `{MM}` | `2026` `26` `08` | From the document date |
| `{SEQ}` | `015` | Padded per `padding` |
| `{SEQ:6}` | `000015` | Inline padding override |

**Confirmed default (decision Q1):** `{PREFIX}{SEQ}/{FY_LONG}` with padding 3 →

```text
Invoices    FT001/2026-2027   FT002/2026-2027   …
Quotations  QT001/2026-2027   QT002/2026-2027   …
```

The quotation prefix is an assumption — the decision named one format without separating the two
document types, so quotations use the same shape with a `QT` prefix to keep the two series
unmistakable. Both are editable in Administration → Masters & Numbering.

> PRD §9 (`INV-0001`) and §10 (`INV-2026-0001`) disagreed with each other and both are superseded by
> the format above. Because the pattern is data, any of the three remains reachable without a code
> change. See [11-decisions.md](11-decisions.md) §1.

## 3. Concurrency-safe generation

```text
NumberingService.next(docType, documentDate, tx):
  fy      = FinancialYearService.resolveForDate(documentDate, tx)
  series  = active numbering_series for docType
  row     = SELECT * FROM document_sequences
              WHERE numberingSeriesId = :s AND financialYearId = :fy
              FOR UPDATE                       -- InnoDB row lock, inside the caller's transaction
  if !row: INSERT (lastNumber = series.startNumber - 1)   -- unique key makes the race safe
  next    = row.lastNumber + 1
  UPDATE document_sequences SET lastNumber = next WHERE id = row.id
  return formatPattern(series, fy, documentDate, next)
```

Guarantees:

1. **No duplicates** — the row lock serialises concurrent creators; additionally
   `quotations.number` / `invoices.number` carry a `UNIQUE` index as a hard backstop. A P2002 there
   surfaces as `DUPLICATE_DOCUMENT_NUMBER` (409) rather than silent corruption.
2. **Same transaction as the document insert** — if the insert rolls back, so does the counter, so a
   failed save does not burn a number.
3. **Never client-supplied** — `number` is not in the create/update request schema at all.
4. **Per-FY reset** — a new FY starts a fresh `document_sequences` row at `startNumber`.

Test: 20 parallel `POST /api/invoices` must produce 20 distinct sequential numbers (Phase 6 test suite).

## 4. When is the number assigned?

**Decision: at first persist**, including for drafts — because the PRD's create screen (§47) displays
`Invoice No FT015/2026-2027` while the document is still being written.

Consequence: a deleted/abandoned draft leaves a gap in the sequence. This is accepted and mitigated by:

- soft-delete only (the number and its owning row survive, so the gap is explainable);
- an audit entry for every draft deletion;
- a "Document number gaps" line in the Phase 8 audit report.

The alternative — a `DRAFT-####` placeholder swapped for a real number on issue — gives gapless
series but shows a number in the UI that later changes, which finance users find alarming. Flagged as
Q7 in case a gapless series is a hard requirement.

## 5. Related numbering

- `customers.customerCode` — separate simple counter (`CUST-0001`) with the same
  `numbering_series` mechanism (`resetPolicy = NEVER`), editable by the user before first save.
- `items.itemCode` — user-supplied, uniqueness enforced by index; optional auto-suggest `ITM-0001`.
- Converted invoices get a **new** invoice number from the current series; the link to the source
  quotation is a foreign key (`invoices.quotationId`), never a shared number.
