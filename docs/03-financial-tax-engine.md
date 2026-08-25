# 03 — Financial & Tax Engine

Location: `shared/src/finance/` (pure, dependency-free except `decimal.js`).
Authority: the **backend** always recalculates from `{ items, discount, adjustment, taxes, currency }`
and persists its own result. Anything the client sends as `subtotal`, `taxTotal` or `grandTotal` is
dropped at the validation boundary — those fields are not even present in the request Zod schema.

## 1. Decimal policy

| Value | Storage | Internal scale | Rounding |
|---|---|---|---|
| Quantity | `DECIMAL(18,3)` | 6 | HALF_UP |
| Rate | `DECIMAL(18,4)` | 6 | HALF_UP |
| Percentages (discount %, tax %) | `DECIMAL(9,4)` | 6 | — |
| Monetary amounts (line & document) | `DECIMAL(18,4)` | 6 during computation | HALF_UP to `currency.decimalPlaces` at every persisted boundary |
| Exchange rate | `DECIMAL(18,8)` | 8 | — |

Rules:

- `decimal.js` configured once: `Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })`.
  HALF_UP matches Indian commercial convention and is what a finance user expects (banker's rounding
  is deliberately **not** used).
- Money is never converted to `number`. Over HTTP it travels as a **string**; the frontend parses it
  back into `Decimal` for display and preview arithmetic.
- Every persisted amount is rounded to the document currency's `decimalPlaces` (INR/USD → 2, JPY → 0).
  Intermediates keep 6 dp so that a chain of operations does not drift.
- `Prisma.Decimal` is the same `decimal.js` implementation, so values pass between layers unwrapped.

## 2. Canonical calculation algorithm

Given `currency` (with `dp = decimalPlaces`), `lines[]`, document-level `discount`,
`adjustment`, and `roundOffEnabled`:

```text
STEP 1 — per line, gross
  lineGross_i        = round(qty_i × rate_i, dp)

STEP 2 — per line, line discount
  lineDiscount_i     = mode = PERCENT ? round(lineGross_i × pct_i / 100, dp)
                                      : min(amount_i, lineGross_i)
  lineNet_i          = lineGross_i − lineDiscount_i

STEP 3 — document discount, proportionally allocated to lines
  docDiscount        = mode = PERCENT ? round(Σ lineNet × pct / 100, dp) : amount
  raw_i              = docDiscount × lineNet_i / Σ lineNet
  alloc_i            = floor(raw_i, dp), then distribute the residual
                       (docDiscount − Σ alloc) one minor unit at a time to the
                       lines with the largest fractional remainder  ← largest-remainder method
  INVARIANT: Σ alloc_i == docDiscount, exactly

STEP 4 — per line, taxable value
  taxable_i          = lineNet_i − alloc_i

STEP 5 — per line, per tax component
  taxAmount_ic       = round(taxable_i × ratePercent_c / 100, dp)
  lineTax_i          = Σ_c taxAmount_ic
  lineTotal_i        = taxable_i + lineTax_i

STEP 6 — document rollup
  subtotal           = Σ lineGross_i
  discountTotal      = Σ lineDiscount_i + docDiscount
  taxableTotal       = Σ taxable_i
  taxTotal           = Σ lineTax_i
  preRound           = taxableTotal + taxTotal + adjustment
  roundOff           = roundOffEnabled ? round(preRound, 0) − preRound : 0
  grandTotal         = preRound + roundOff

STEP 7 — reporting conversion (never used for the printed document)
  baseTotal          = round(grandTotal × exchangeRateToBase, baseCurrency.dp)
```

Notes on the choices:

- **Tax is computed per line, then summed** — not on the document subtotal. This is the GST-correct
  order and it is what makes a per-line/per-rate tax summary add up exactly to `taxTotal`.
- **Document discount is applied before tax** (it reduces taxable value), which is correct for GST.
  If the business ever wants an after-tax "cash discount", that is a *different* field and would be
  added as `postTaxDeduction` — the engine leaves room for it but MVP does not expose it.
- **`adjustment` vs `roundOff`** are separate columns. `adjustment` is a deliberate human entry
  (PRD §16 shows it in the totals block); `roundOff` is the automatic to-the-rupee correction. Merging
  them would make invoices impossible to explain to a customer.
- The largest-remainder allocation in Step 3 guarantees the discount shown in the totals block equals
  the sum of what was deducted from lines — the classic source of "₹0.01 doesn't tie" bug reports.

## 3. Worked examples (these become unit-test fixtures)

**A. PRD §16 example — INR, single 18% intra-state GST, document discount**

```text
Lines: subtotal 100,000.00
Document discount           5,000.00
Taxable total              95,000.00
CGST 9%                     8,550.00
SGST 9%                     8,550.00
Tax total                  17,100.00
Adjustment                      0.00
Grand total               112,100.00
```

*(The PRD text shows ₹17,100 tax against a ₹5,000 discount and a ₹112,100 total, i.e. tax computed
on ₹95,000 — confirming discount-before-tax. Its "Subtotal 100,000 − 5,000 + 17,100 = 112,100"
arithmetic is consistent with this engine.)*

**B. Inter-state — IGST 18% on ₹100,000** → IGST 18,000.00, total 118,000.00.

**C. Export / overseas customer, USD, zero-rated** → `taxTreatment = OVERSEAS`, tax type
`ZERO_RATED`, tax total $0.00, and the PDF prints "Supply meant for export — zero rated".

**D. JPY, 0 decimal places** — ¥12,345 × 3 @ 10% tax rounds at 0 dp throughout; no `.00` is ever
printed, and `roundOff` is always 0 because the currency has no minor unit.

**E. Mixed-rate document** — 3 lines at 18%, 12% and exempt, with a document-level 7% discount:
asserts the allocation invariant and a 3-row tax summary.

## 4. Tax engine

### 4.1 Model

```text
tax_types          CGST · SGST · IGST · UTGST · EXEMPT · ZERO_RATED · NON_GST   (configurable rows)
tax_rates          (taxTypeId, name, rate, effectiveFrom/To, isActive)
tax_groups         "GST 18% (Intra-state)" → [CGST 9%, SGST 9%]
                   "GST 18% (Inter-state)" → [IGST 18%]
```

A user picks **one** tax on a line (a group or a single rate); the engine expands it into the
component rows that get stored and printed. Rates live in the database, never in a component or a
constant (PRD §34, brief §9).

### 4.2 Place-of-supply resolution

```text
companyStateCode  (company_settings)
customerPlaceOfSupplyStateCode  (customer / document override)

if customer.taxTreatment == OVERSEAS       → ZERO_RATED (export)
else if customer.taxTreatment == SEZ       → ZERO_RATED (LUT/bond note)
else if placeOfSupply == companyState      → INTRA_STATE group (CGST+SGST, or UTGST if a UT)
else                                       → INTER_STATE group (IGST)
```

This is a **suggestion engine**: it pre-selects the right tax group when the customer is chosen, and
the user can override per line. The resolved decision and the state codes are stored on the document
so the PDF and any later audit can explain the choice. `place_of_supply` is a stored, editable field
on the document — never re-derived at read time.

### 4.3 Tax summary snapshot

```json
{
  "byComponent": [
    { "label": "CGST 9%",  "taxTypeKey": "CGST", "ratePercent": "9.0000",
      "taxableAmount": "95000.0000", "taxAmount": "8550.0000" },
    { "label": "SGST 9%",  "taxTypeKey": "SGST", "ratePercent": "9.0000",
      "taxableAmount": "95000.0000", "taxAmount": "8550.0000" }
  ],
  "byHsn": [ { "hsnSac": "998314", "taxableAmount": "95000.0000", "taxAmount": "17100.0000" } ],
  "totalTax": "17100.0000",
  "amountInWords": "One Lakh Twelve Thousand One Hundred Rupees Only"
}
```

Written on every save, frozen on the document, consumed directly by the template. `amountInWords`
is generated per currency (Indian lakh/crore wording for INR, international for others) and is part
of the snapshot so it can never disagree with the printed total.

## 5. Currency handling

- `currencies` master seeded with INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, CHF; adding more is a
  data operation, not a code change.
- Each document stores `currencyCode`, `currencySymbol` and `currencyDecimalPlaces` **as a snapshot**
  (PRD §32: never derive a historical document's currency from current settings).
- Formatting respects `thousandSeparatorStyle`: INR → `₹1,25,000.00` (Indian grouping),
  USD → `$1,500.00`. Implemented in `shared/finance/formatMoney.ts` and used by both the UI and the
  PDF templates, so a number never looks different in the two places.
- `exchangeRateToBase` + `baseTotal` are captured at document creation for consolidated reporting.
  Rate source is manual entry (default 1.0000 when the document currency equals the base currency).
  Reports show per-currency subtotals **and** a base-currency roll-up, clearly labelled with the
  base currency — mixing currencies into one meaningless "total value" is avoided.
  *(This addition needs sign-off — see `10-open-questions.md`, Q3.)*

## 6. Where each rule is enforced

| Rule | Enforcement point |
|---|---|
| Client totals ignored | Request Zod schema omits total fields entirely |
| Totals recomputed | `CalculationService.compute(input)` called inside the create/update transaction |
| Rounding consistency | Single `roundMoney(value, currency)` helper; lint rule bans `toFixed` in backend/`shared` |
| Quantity > 0, rate ≥ 0, discount ≤ line gross | Zod + engine guard (`BusinessRuleError`) |
| At least one line item | Zod (`min(1)`) |
| Tax rate must be active on the document date | `TaxService.assertUsable(taxRateId, documentDate)` |
| Currency must be active | FK + `isActive` check |
| Document currency immutable after issue | `DocumentService` guard (proposed — see Q4) |
