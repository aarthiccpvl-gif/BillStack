# 07 — Template Engine & PDF Architecture

This is the highest-risk, highest-value subsystem. The rule that keeps it maintainable:
**document layout exists in exactly one place, and it is not the React application.**

## 1. Pipeline

```text
Quotation/Invoice (+items, +taxes)
        │  DocumentService.buildDocumentData()
        ▼
DocumentData                     ← versioned, pure JSON contract in shared/types
        │  + TemplateVersion.configJson  + CompanySnapshot(logo, colors, bank)
        ▼
RenderService.render(data, config)          backend/src/render
        │  React SSR → renderToStaticMarkup
        │  + print CSS with CSS custom properties from config
        │  + assets inlined as data: URIs (logo, signature, fonts)
        ▼
Self-contained HTML string  (zero external requests)
        ├──────────────► GET/POST …/preview        → browser <iframe srcDoc>
        └──────────────► PdfService.fromHtml()     → Puppeteer → A4 PDF
                                                     → StorageService.put()
                                                     → document_files row
```

Because the preview and the PDF consume **the same HTML from the same function**, "the PDF looks
different from the preview" is structurally impossible — the only remaining difference is Chromium's
paginated print rendering, which the preview also shows by constraining the iframe to A4 width.

## 2. `DocumentData` contract

A stable, self-contained shape (`shared/src/types/documentData.ts`) with `schemaVersion`, so a
revision snapshot taken today still renders in two years:

```ts
interface DocumentData {
  schemaVersion: 1;
  docType: 'QUOTATION' | 'INVOICE';
  number: string;
  status: string;
  dates: { document: string; expiry?: string; due?: string };
  reference?: string; subject?: string;
  company: {                          // snapshot, never a live lookup
    name: string; legalName?: string; address: AddressBlock;
    phone?: string; email?: string; website?: string;
    gstin?: string; pan?: string; cin?: string;
    logo?: { dataUri: string; widthMm: number };
    signature?: { dataUri: string; label?: string };
  };
  customer: { name: string; code: string; companyName?: string; contactPerson?: string;
              email?: string; phone?: string; gstin?: string; pan?: string;
              taxTreatment: string; placeOfSupply?: string };
  billingAddress?: AddressBlock;
  shippingAddress?: AddressBlock;
  currency: { code: string; symbol: string; decimalPlaces: number;
              symbolPosition: 'PREFIX'|'SUFFIX'; separatorStyle: 'WESTERN'|'INDIAN' };
  lines: Array<{ lineNumber: number; name: string; description?: string; hsnSac?: string;
                 unit?: string; quantity: string; rate: string;
                 discount?: { label: string; amount: string };
                 taxes: Array<{ label: string; ratePercent: string; taxAmount: string }>;
                 taxableAmount: string; lineTotal: string }>;
  totals: { subtotal: string; discountTotal: string; taxableTotal: string; taxTotal: string;
            adjustment: string; roundOff: string; grandTotal: string;
            amountPaid?: string; balanceDue?: string; amountInWords: string };
  taxSummary: { byComponent: TaxSummaryRow[]; byHsn?: TaxSummaryRow[] };
  bank?: { bankName: string; accountName: string; accountNumber: string; ifsc?: string;
           swift?: string; branch?: string; paymentInstructions?: string };
  notes?: string; terms?: string; customerMessage?: string;
  customFields?: Array<{ label: string; value: string }>;
  meta: { templateKey: string; templateVersion: number; documentVersion: number;
          generatedAt: string; qrPayload?: never /* reserved: e-invoice */ };
}
```

All amounts are **pre-formatted-safe strings** (raw decimal strings); formatting to `₹1,25,000.00`
happens in the renderer using the shared `formatMoney` so screen and PDF agree exactly.

## 3. `TemplateConfig` schema

Zod-validated (`shared/src/schemas/templateConfig.ts`), stored in `template_versions.configJson`.
This is the entirety of what "template customization" means — no free-form HTML/CSS editing, which
would be a security and maintenance hazard in an internal tool.

```ts
{
  branding: {
    logo:   { show, position: 'LEFT'|'CENTER'|'RIGHT', widthMm: 20–80 },
    colors: { primary, secondary, text, muted, tableHeaderBg, tableHeaderText, border },
    signature: { show, imageMm, label },
    seal:      { show, imageMm, position }        // company stamp — its own upload and area (Q13)
  },
  typography: {
    fontFamily: 'Inter'|'Roboto'|'Lato'|'Source Sans 3'|'Merriweather',  // self-hosted whitelist
    baseSizePt: 8–12, headingSizePt: 12–24, tableSizePt: 7–11, lineHeight: 1.1–1.8
  },
  layout: {
    pageSize: 'A4', marginsMm: { top, right, bottom, left },
    documentTitle: string,                 // "TAX INVOICE" / "QUOTATION" / "ESTIMATE"
    headerStyle: 'BANNER'|'MINIMAL'|'SPLIT',
    showHeaderOnAllPages: boolean,
    footer: { text, showPageNumbers, showGeneratedAt },
    sectionSpacingMm, tableStyle: 'BORDERED'|'STRIPED'|'MINIMAL',
    itemColumns: Array<{ key: 'sno'|'item'|'description'|'hsn'|'unit'|'qty'|'rate'|'discount'|'tax'|'amount',
                         show: boolean, label: string, widthPct: number, align }>
  },
  sections: {                              // PRD §26 visibility switches
    billingAddress, shippingAddress, gstDetails, hsnColumn, taxSummary,
    bankDetails, paymentInstructions, notes, terms, signature, seal, customerMessage,
    customFields, amountInWords, declaration
  },
  content: { declarationText?, footerNote?, thankYouNote? },
  locale: { dateFormat: 'dd-MMM-yyyy'|'dd/MM/yyyy'|'yyyy-MM-dd' }
}
```

Validation guarantees: `itemColumns` widths must total 100; margins within printable bounds;
`fontFamily` from the whitelist (self-hosted, so no external CDN call at render time).

## 4. Renderer implementation

**Decision: React SSR (`renderToStaticMarkup`) inside the backend `render/` module.**

```text
backend/src/render/
├── registry.ts                 engineKey → layout component
├── layouts/
│   ├── CorporateLayout.tsx     banner header, strong colour block, dense table
│   ├── ModernLayout.tsx        minimal, generous whitespace, accent rules
│   └── ClassicLayout.tsx       traditional bordered/serif, formal
├── blocks/                     shared, config-driven pieces
│   ├── PartyBlock  ItemsTable  TotalsBlock  TaxSummaryBlock
│   ├── BankBlock   NotesBlock  TermsBlock   SignatureBlock  SealBlock  HeaderBanner
├── css/
│   ├── base.print.css          @page, page-break rules, table repeat
│   ├── theme.ts                config → CSS custom properties
│   └── fonts/                  self-hosted woff2, inlined as data URIs
└── renderService.ts            assemble → single HTML string
```

Rationale: the three templates differ in *arrangement*, not in data, so composable blocks reuse ~80%
of the code and a fourth template becomes a new layout file plus a registry entry — satisfying "the
architecture must support adding additional templates later". React also gives type-safety against the
`DocumentData` contract and cheap golden-snapshot tests. *(A string template engine such as Eta is
the fallback if React in the backend proves awkward — noted as Q11.)*

Critical rendering rules baked into `base.print.css`:

```css
@page { size: A4; margin: 0; }                     /* margins come from config, applied in-flow */
thead { display: table-header-group; }             /* repeat item-table header on every page */
tfoot { display: table-footer-group; }
tr, .block, .totals { break-inside: avoid; }
.page-break { break-after: page; }
.totals-block { break-before: avoid; }             /* totals never orphaned from the table */
```

## 5. PDF service

```ts
PdfService.fromHtml(html, { headerHtml, footerHtml, marginsMm, timeoutMs })
```

- One shared Chromium instance (launched lazily, `--no-sandbox` only in containers), with a small
  page pool bounded by `PDF_CONCURRENCY`; pages are always closed in a `finally`.
- `page.setContent(html, { waitUntil: 'load' })` — no `networkidle` wait is needed because the HTML is
  fully self-contained (all assets are data URIs). This also makes rendering deterministic and fast,
  and means the renderer works with no network at all.
- `page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate, footerTemplate, margin })`.
- Footer template carries `Page <span class="pageNumber"></span> of <span class="totalPages"></span>`
  plus the document number, satisfying the page-number and multi-page requirements.
- Failures throw `PDF_GENERATION_FAILED` (502) and are logged with the `requestId`; the document row
  is untouched.
- A boot-time smoke render (behind a flag) fails fast if Chromium is missing in the environment.

## 6. Storage & caching of generated PDFs

```text
storageKey pattern:
  documents/{quotations|invoices}/{FY}/{NUMBER}/v{documentVersion}-t{templateVersion}.pdf
e.g. documents/invoices/2026-27/INV-2026-0015/v2-t3.pdf
```

- `StorageService` interface: `put(key, buffer, meta)`, `getStream(key)`, `getSignedUrl(key, ttl)`,
  `exists(key)`, `delete(key)` (never called for financial documents). Adapters: `LocalDiskAdapter`
  (dev, under `STORAGE_LOCAL_ROOT`, path-traversal guarded) and `S3Adapter` (later, MinIO-verified).
- Downloads are always **proxied through the API** (`GET /api/files/:id`) so permissions and audit
  apply; signed URLs stay an internal capability for future direct-to-S3 use.
- A PDF is generated on demand and reused while `(documentVersion, templateVersionId)` is unchanged;
  editing a document invalidates nothing destructively — it simply produces a new versioned file, so
  the PDF a customer received in v1 remains byte-identical and downloadable forever.
- `checksumSha256` is stored, which lets the audit trail prove that a re-download is the same file.

## 7. Preview parity in the UI

- `POST /api/quotations/preview` / `/api/invoices/preview` accepts the **unsaved** editor payload,
  runs the *real* calculation engine and the *real* renderer, and returns HTML.
- The frontend shows it in `<iframe sandbox="allow-same-origin" srcDoc={html}>` scaled to A4 width, so
  what the user sees is the actual print output, not an approximation.
- Requests are debounced (~400 ms) and cancelled via `AbortController`; while a preview is in flight
  the totals panel still updates instantly from the shared client-side engine, so the UI never feels
  laggy.
- Preview is a read operation: it is permitted for Finance Viewer and writes nothing.

## 8. Template versioning behaviour

```text
Template "Corporate" (INVOICE)
  v1 PUBLISHED  2026-04-01   ← INV-2026-0001 … 0014 reference this
  v2 PUBLISHED  2026-08-10   ← INV-2026-0015 onwards
  v3 DRAFT                   ← editable, previewable, not selectable on documents
```

- Editing a PUBLISHED version is rejected (`IMMUTABLE_RESOURCE`); the UI's "Edit" action clones it to
  a new DRAFT version.
- Documents store `templateVersionId`. Re-downloading an old invoice re-renders with **its** version,
  so historical documents never change appearance (PRD §28).
- Changing a template's default affects only documents created afterwards.
- The template editor is the PRD §50 two-pane layout: config form on the left, live preview on the
  right, driven by `POST /api/templates/preview` with sample data.

## 9. Test plan

| Test | Assertion |
|---|---|
| Golden HTML snapshots | 3 templates × {invoice, quotation} × {all sections on, all optional off} |
| Config validation | Column widths ≠ 100 rejected; font outside whitelist rejected |
| Multi-page | 60-line document → ≥ 2 pages, header row repeated on each, totals not orphaned |
| Page numbers | `pdf-parse` text contains "Page 1 of 2" and "Page 2 of 2" |
| Logo & signature | PDF contains an image XObject; absent when `sections.signature = false` |
| Currency | INR document renders `₹1,25,000.00`; USD `$1,500.00`; JPY has no decimals |
| Tax breakdown | Rendered component rows sum exactly to `totals.taxTotal` |
| Version fidelity | Re-render of revision v1 with template v1 matches the stored v1 PDF checksum |
| Determinism | Same input rendered twice → identical HTML (no timestamps inside the body) |
