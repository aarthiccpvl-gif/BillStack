# 08 — Frontend Architecture

## 1. Application shell

```text
AuthLayout        (centred card)            → /login
AppShell                                    → everything else
 ├── Sidebar      collapsible, permission-filtered
 ├── Topbar       global search · FY selector · user menu · notifications
 ├── Breadcrumbs
 └── <Outlet/>    page content (max-width container, data-dense)
```

Sidebar for Admin / Super Admin (PRD §44):

```text
Dashboard
Sales      → Quotations · Invoices
Masters    → Customers · Products & Services
Templates
Reports
Administration → Users & Roles · Company Settings · Masters (currencies/taxes/units/FY) · Audit Logs
```

Finance Viewer sees only: Dashboard · Quotations · Invoices · Customers · Reports · Downloads.
The menu is generated from a route manifest, each entry declaring the permission it needs, so a
Finance Viewer's sidebar is a *consequence* of permissions rather than a separate hard-coded list.

## 2. Route structure

| Path | Page | Permission |
|---|---|---|
| `/login` | Login | public |
| `/` | Dashboard | `dashboard.read` |
| `/quotations` | List (filters, bulk actions) | `quotation.read` |
| `/quotations/new` | Editor | `quotation.create` |
| `/quotations/:id` | Detail (preview, timeline, actions) | `quotation.read` |
| `/quotations/:id/edit` | Editor | `quotation.update` |
| `/quotations/:id/history` | Revision history + compare | `quotation.read` |
| `/invoices` `/invoices/new` `/invoices/:id` `/invoices/:id/edit` `/invoices/:id/history` | as above | `invoice.*` |
| `/customers` `/customers/new` `/customers/:id` `/customers/:id/edit` | Customer master + detail tabs | `customer.*` |
| `/items` `/items/new` `/items/:id/edit` | Item master | `item.*` |
| `/templates` `/templates/:id/versions/:v/edit` | Template list + two-pane editor | `template.*` |
| `/reports` `/reports/quotations` `/reports/invoices` `/reports/customers` `/reports/summary` | Reports + export | `report.read` |
| `/downloads` | Bulk download workspace | `document.bulk_download` |
| `/admin/users` `/admin/roles` `/admin/company` `/admin/masters/*` `/admin/audit` | Administration | respective |
| `/profile` | Profile & password | — |
| `*` | 404 | — |

Guards: `<RequireAuth>` wraps the shell; `<RequirePermission perm="…">` wraps each route element and
renders a 403 page rather than redirecting silently (a redirect makes a permission bug look like a
routing bug). Modules are code-split with `React.lazy` + a shared `<RouteSuspense>`.

## 3. State management

| State kind | Owner |
|---|---|
| Server data | **TanStack Query** — the only cache |
| Auth/session | `AuthProvider` (`/auth/me` query + `hasPermission()` helper) |
| Form state | React Hook Form, Zod resolver, schemas from `@app/shared` |
| Ephemeral UI | local `useState` / URL search params |
| Toasts | `ToastProvider` (Bootstrap toasts) |
| Filters & paging | **URL search params** — so a filtered list is shareable and back/forward works, and exports can reuse the same query string |

Query conventions:

```ts
export const invoiceKeys = {
  all:    ['invoices'] as const,
  list:   (f: InvoiceFilters) => [...invoiceKeys.all, 'list', f] as const,
  detail: (id: string)        => [...invoiceKeys.all, 'detail', id] as const,
  history:(id: string)        => [...invoiceKeys.all, 'history', id] as const,
};
```

- `staleTime`: masters (currencies, taxes, units, templates) 10 min; lists 30 s; details 0.
- Mutations invalidate the narrowest sensible key set, plus `dashboard` when a document changes state.
- No optimistic updates on financial documents — the server's computed totals are the truth, so we
  wait for the response and replace the cache with it.
- One Axios instance: envelope unwrapping, `X-Requested-With`, 401 → single silent `/auth/refresh`
  retry → otherwise redirect to login, and error normalisation into `ApiError` for toasts and
  field-level form errors (`details[].path` mapped back into RHF `setError`).

## 4. The document editor (the most important screen)

One generic implementation serves both quotations and invoices — the PRD's "do not duplicate
quotation/invoice logic" applied to the UI:

```text
modules/documents/
├── DocumentEditor.tsx          orchestration; kind-agnostic
├── config/quotationConfig.ts   labels, date fields, statuses, actions, endpoints
├── config/invoiceConfig.ts
├── sections/
│   ├── DocumentHeaderSection   number (read-only) · dates · reference · currency · FY badge
│   ├── CustomerSection         searchable select + inline "New customer" modal + address picker
│   ├── ItemsTableSection       the core grid
│   ├── TotalsSection           subtotal · discount · tax · adjustment · round-off · grand total
│   ├── NotesTermsSection       notes · terms · customer message · payment instructions · bank
│   ├── TemplateSection         template + version badge
│   └── AttachmentsSection
├── DocumentPreviewPane.tsx     iframe of server-rendered HTML
└── useDocumentTotals.ts        shared finance engine, client side
```

Layout (matching the brief §5): a two-column workspace — form on the left (~62%), sticky live preview
on the right (~38%), collapsible to full-width form on smaller screens; sticky action bar at the
bottom with `Save Draft · Preview · Generate PDF · Send` (plus `Mark Accepted · Convert to Invoice`
for quotations).

Items grid behaviour: keyboard-first (Tab/Enter to add a row, Ctrl+D duplicate, Alt+↑/↓ reorder),
item-master autocomplete that fills description/rate/unit/tax/HSN, per-line discount and tax-group
selectors, drag handle for reordering, running line amount, and a row error indicator. Totals
recompute locally on every keystroke via the **shared decimal engine** — identical arithmetic to the
backend, so the displayed total never jumps after save.

Save flow:

```text
submit → zod validate (shared schema) → POST/PATCH → server returns computed document
       → replace cache → toast → route to detail (or stay for "Save & new")
```

`changeReason` is collected in a modal when editing a document past DRAFT, matching the API's
requirement rather than discovering the 422 after the fact.

## 5. Shared component inventory

`DataTable` (server-side sort/paginate/select, column config, empty & loading states, sticky header),
`FilterBar` (URL-param bound), `SearchInput` (debounced), `StatusBadge` (status→variant map, one place
only), `Money` (currency-aware, right-aligned, tabular numerals), `DateText`, `FormField` /
`FormSelect` / `FormTextarea` / `FormDatePicker` (RHF-bound, error + help text), `AsyncSelect`,
`ConfirmDialog`, `ReasonDialog`, `Drawer`, `Tabs`, `Breadcrumbs`, `Pagination`, `KpiCard`,
`ChartCard`, `Timeline` (status + audit history), `FileUpload` (type/size validated client-side too),
`PermissionGate`, `EmptyState`, `ErrorState`, `PageHeader` (title + actions).

## 6. Styling

```text
styles/
├── _variables.scss     Bootstrap variable overrides (brand colours, radii, spacing, font stack)
├── _bootstrap.scss     imports only the Bootstrap partials actually used
├── _mixins.scss
├── base/               reset, typography, utilities
├── components/         table, card, badge, sidebar, editor grid, preview pane
└── main.scss
```

Bootstrap 5 is themed through SCSS variables, not overridden with `!important`. A small design token
set (spacing scale, 3 text sizes, brand + status colours) keeps the app visually consistent.
Desktop-first with sensible breakpoints; data tables scroll horizontally on narrow screens rather than
collapsing into cards, because finance users compare columns. Company brand colours from
`company_settings` are injected as CSS custom properties at runtime so the app reflects the brand
without a rebuild.

## 7. Formatting & i18n readiness

`formatMoney`, `formatQuantity`, `formatDate`, `amountInWords` all come from `@app/shared`, so a number
looks the same in a list, in the editor, in the PDF and in an export. All user-facing strings live in
module-level constants files — not a full i18n framework in MVP, but structured so one can be added
without touching JSX.

## 8. Accessibility & UX baseline

Keyboard-navigable everywhere (the items grid especially), visible focus rings, labelled form
controls with `aria-describedby` error text, `aria-live` toasts, colour never the sole status signal
(badge text always present), 4.5:1 contrast minimum, and `prefers-reduced-motion` respected.

## 9. Frontend test plan

- `useDocumentTotals` vs backend fixtures — the same JSON fixtures used by the backend engine tests,
  guaranteeing the two engines cannot drift.
- Editor integration: add/remove/reorder lines, discount modes, currency switch, tax group change,
  validation messages, `changeReason` modal appears only past DRAFT.
- Guards: Finance Viewer sees no create/edit/send buttons **and** a direct URL to `/invoices/new`
  renders 403.
- `DataTable` filter/sort/pagination round-trips through URL params.
- Axios interceptor: 401 → refresh → retry once → redirect on second failure.
