# Internal Invoice & Quotation Management System

**Version:** 2.0  
**Status:** Development Reference  
**Initial Department:** IT Department  
**Company Scope:** Single Company  
**Currency:** Multi-currency  
**Primary Users:** Admin / Billing Users / Finance Viewer  
**Reference Product:** Zoho Invoice  
**Purpose:** Internal quotation and invoice generation and management

---

# 1. Product Overview

The company requires an internal web-based system to create, manage, customize, generate, download, and share professional **quotations and invoices**.

The system will initially be used by the **IT Department**.

The system should take inspiration from the workflow and feature structure of Zoho Invoice, but it should **not attempt to replicate Zoho Invoice completely**.

The first version should focus on:

- Customer management
- Product/service management
- Quotation creation
- Quotation management
- Invoice creation
- Invoice management
- Quotation → Invoice conversion
- Invoice and quotation templates
- Company logo and branding
- PDF generation
- Email sharing
- WhatsApp sharing
- Downloading
- Multi-currency support
- GST support
- Admin management
- Finance read-only access
- Reports and exports
- Audit/revision history

Future features such as online payments, customer portals, recurring invoices, accounting integrations, expenses, projects, and timesheets should be architected for but **not included in the initial MVP**.

---

# 2. Important Product Decisions

These decisions are confirmed and should be treated as product requirements.

| Area | Decision |
|---|---|
| Initial purpose | Internal quotation and invoice generator/management tool |
| Legal e-invoicing | Not required initially |
| E-Invoice / IRN | Explicitly excluded |
| GST | Required |
| GST types | CGST, SGST, IGST, UTGST, Exempt, Zero Rated, Non-GST |
| Current usage | IT Department |
| Company count | One company |
| Invoice numbering | Fresh numbering every financial year |
| Quotation approval | Internal Admin |
| Document sharing | Email + WhatsApp + Download |
| Finance role | Read-only + Export + Download |
| Data retention | Permanent; no automatic deletion |
| Currency | Multi-currency |
| Initial currencies | INR and USD, with support for a broader currency list |
| Payment integration | Not required initially |
| Customer payment | Customer pays directly to company bank account |
| Accounting integration | Not required initially |
| Customer portal | Not required initially |
| Recurring invoices | Future phase |
| Online payment | Future phase |
| E-Invoice | Excluded from current scope |

---

# 3. Product Goal

The main goal is to create a centralized system where authorized company users can:

1. Maintain customer information.
2. Maintain products and services.
3. Create professional quotations.
4. Send quotations to customers.
5. Track quotation status.
6. Convert quotations into invoices.
7. Create invoices independently.
8. Customize invoice and quotation templates.
9. Upload and manage company branding/logo.
10. Generate professional PDFs.
11. Send documents through email.
12. Share documents through WhatsApp.
13. Download documents.
14. Allow Finance users to view and export information.
15. Maintain complete document history and revision records.

---

# 4. Product Philosophy

The system should be:

- Simple
- Professional
- Fast
- Easy for non-technical finance/admin users
- Highly reusable
- Template-driven
- Secure
- Auditable
- Multi-currency capable
- GST-ready
- Extensible for future integrations

Do not over-engineer the first version.

The architecture should allow future expansion without requiring a complete rewrite.

---

# 5. User Roles

## 5.1 Super Admin

Full access to the system.

### Permissions

- View dashboard
- Manage users
- Manage roles
- Manage company settings
- Manage logo
- Manage templates
- Manage customers
- Manage products/services
- Create quotations
- Edit quotations
- Send quotations
- Approve/mark quotation status
- Convert quotation to invoice
- Create invoices
- Edit invoices
- Send invoices
- Cancel invoices
- Download invoices
- Download quotations
- Export reports
- View audit logs
- View revision history

---

# 5.2 Admin / Billing User

Operational user responsible for creating and managing documents.

### Permissions

- View dashboard
- View customers
- Create/edit customers
- View products/services
- Create/edit products/services
- Create quotations
- Edit quotations
- Send quotations
- Download quotations
- Create invoices
- Edit invoices
- Send invoices
- Download invoices
- Convert quotations to invoices
- View reports
- Export permitted reports

Cannot:

- Manage system users
- Change major company settings
- Manage permissions
- Delete audit logs

---

# 5.3 Finance Viewer

This is a **strictly read-only role**.

The Finance Viewer should be able to:

- View dashboard
- View customers
- View quotations
- View invoices
- View document details
- Search documents
- Filter documents
- Download quotations
- Download invoices
- Export reports
- Export data
- View financial summaries
- View audit history

The Finance Viewer must NOT be able to:

- Create quotations
- Edit quotations
- Delete quotations
- Create invoices
- Edit invoices
- Cancel invoices
- Convert quotations to invoices
- Modify templates
- Modify company settings
- Manage users
- Modify permissions

All read-only restrictions must be enforced on the backend/API level, not only by hiding frontend buttons.

---

# 6. Main Application Modules

The initial application should contain:

```text
Dashboard
Customers
Products / Services
Quotations
Invoices
Templates
Reports
Users & Roles
Company Settings
Audit Logs
Profile
```

---

# 7. Dashboard

The dashboard should provide an overview of the business's quotation and invoice activity.

## KPI Cards

Quotation:

- Total Quotations
- Draft Quotations
- Sent Quotations
- Accepted Quotations
- Declined Quotations
- Expired Quotations
- Quotation Value

Invoice:

- Total Invoices
- Draft Invoices
- Sent Invoices
- Paid Invoices
- Partially Paid Invoices
- Overdue Invoices
- Cancelled Invoices
- Total Invoice Value

## Dashboard Charts

Recommended:

### Monthly Invoice Value

Show invoice totals by month.

### Monthly Quotation Value

Show quotation totals by month.

### Quotation Conversion

Show:

```text
Total Quotes
Accepted
Declined
Expired
Converted
```

### Recent Documents

Display:

- Document number
- Customer
- Type
- Date
- Amount
- Status

---

# 8. Company Settings

Since this is a single-company application, company configuration should be centralized.

## Company Information

Fields:

- Company Name
- Legal Name
- Address
- City
- State
- Country
- PIN/ZIP
- Phone
- Email
- Website
- GSTIN
- PAN
- CIN
- Other registration numbers

## Branding

- Company Logo
- Favicon
- Primary Brand Color
- Secondary Brand Color
- Default Font
- Company Signature

## Bank Details

Fields:

- Bank Name
- Account Name
- Account Number
- IFSC
- SWIFT
- Branch
- Payment Instructions

These details should optionally appear on invoices and quotations.

---

# 9. Financial Year

The system must support financial-year-based document numbering.

For India, the default financial year should be:

```text
April 1 → March 31
```

Example:

```text
FY 2026-27
01-Apr-2026 → 31-Mar-2027
```

At the beginning of a new financial year, numbering starts fresh.

Example:

```text
FY 2025-26

INV-0001
INV-0002
INV-0003

FY 2026-27

INV-0001
INV-0002
INV-0003
```

The system must store the financial year against every quotation and invoice.

---

# 10. Document Numbering

## Quotation

Example:

```text
QT-2026-0001
QT-2026-0002
QT-2026-0003
```

## Invoice

Example:

```text
INV-2026-0001
INV-2026-0002
INV-2026-0003
```

The numbering format should be configurable.

Possible configuration:

```text
Prefix
Financial Year
Sequence
Starting Number
Padding Length
```

Example:

```text
INV-{FY}-{SEQ}
```

The final number must always be generated by the backend.

Do not trust document numbers submitted from the frontend.

Use database-level unique constraints.

---

# 11. Customer Management

Create a centralized customer master.

## Customer Fields

### Basic Information

- Customer ID
- Customer Code
- Customer Name
- Company Name
- Contact Person
- Email
- Phone
- Alternate Phone

### Billing Address

- Address
- City
- State
- Country
- PIN/ZIP

### Shipping Address

- Address
- City
- State
- Country
- PIN/ZIP

### Tax Information

- GSTIN
- Tax Type
- PAN
- Other Tax ID

### Billing Configuration

- Default Currency
- Payment Terms
- Notes

---

# 12. Customer Detail Page

The customer detail page should show:

```text
Customer Information

Billing Information

Shipping Information

Tax Information

Quotation History

Invoice History

Total Quotation Value

Total Invoice Value

Outstanding Amount
```

Payment/outstanding calculations can be expanded when payment tracking is implemented.

---

# 13. Products / Services

Create a reusable item/service master.

## Fields

- Item ID
- Item Code / SKU
- Name
- Description
- Type
  - Product
  - Service
- Unit
- Default Rate
- Tax Type
- Tax Rate
- Currency
- Status
- Category

Example:

```text
Website Development
Service
Rate: ₹50,000
Tax: GST 18%
```

When creating an invoice or quotation, users should be able to select an existing item instead of manually entering all information.

---

# 14. Quotation Management

The quotation module is one of the core modules.

## Quotation List

Columns:

- Quotation Number
- Customer
- Date
- Expiry Date
- Currency
- Amount
- Status
- Created By
- Created Date
- Actions

Actions:

- View
- Edit
- Duplicate
- Download
- Send
- Convert to Invoice
- Cancel
- View History

---

# 15. Quotation Creation

The quotation creation screen should contain:

## Header

- Quotation Number
- Quotation Date
- Expiry Date
- Reference Number
- Currency

## Customer

- Select Customer
- Add Customer

## Items

Columns:

```text
Item
Description
Quantity
Unit
Rate
Discount
Tax
Amount
```

Users should be able to:

- Add item
- Remove item
- Reorder item
- Add custom item
- Change quantity
- Change rate
- Apply discount
- Apply tax

---

# 16. Quotation Calculation

The system should automatically calculate:

```text
Subtotal
- Discount
+ Tax
+ Adjustment
= Grand Total
```

Example:

```text
Subtotal        ₹100,000
Discount          ₹5,000
Tax              ₹17,100
Adjustment          ₹0
------------------------
Grand Total     ₹112,100
```

All calculations must also be recalculated on the backend.

Never rely only on frontend calculations.

---

# 17. Quotation Additional Sections

Allow:

- Notes
- Terms & Conditions
- Payment Instructions
- Bank Details
- Customer Message
- Attachments
- Signature
- Custom Fields

---

# 18. Quotation Status

Recommended lifecycle:

```text
DRAFT
   ↓
SENT
   ↓
VIEWED
   ↓
ACCEPTED
   ↓
CONVERTED
   OR
DECLINED
   OR
EXPIRED
```

For the current version, quotation approval is handled internally by Admin.

Customer portal approval can be added later.

---

# 19. Quotation → Invoice Conversion

This is a critical feature.

When Admin selects:

```text
Convert to Invoice
```

the system should automatically copy:

- Customer
- Billing address
- Shipping address
- Currency
- Items
- Descriptions
- Quantities
- Rates
- Discounts
- Taxes
- Notes
- Terms
- Relevant references

into a new invoice.

The invoice must store:

```text
quotation_id
```

so the relationship is maintained.

Example:

```text
QT-2026-0025
       ↓
INV-2026-0018
```

The quotation should show:

```text
Converted to Invoice
INV-2026-0018
```

---

# 20. Invoice Management

## Invoice List

Columns:

- Invoice Number
- Customer
- Invoice Date
- Due Date
- Currency
- Amount
- Status
- Created By
- Created Date
- Actions

Actions:

- View
- Edit
- Duplicate
- Download
- Send
- Cancel
- View History

---

# 21. Invoice Creation

Invoice creation should contain:

## Header

- Invoice Number
- Invoice Date
- Due Date
- Payment Terms
- Reference Number
- Currency

## Customer

- Customer
- Billing Address
- Shipping Address

## Items

```text
Item
Description
Quantity
Unit
Rate
Discount
Tax
Amount
```

## Totals

```text
Subtotal
Discount
Tax
Adjustment
Grand Total
```

## Additional Sections

- Notes
- Terms
- Payment Instructions
- Bank Details
- Attachments
- Signature
- Custom Fields

---

# 22. Invoice Status

Initial status model:

```text
DRAFT
   ↓
ISSUED
   ↓
SENT
   ↓
VIEWED
   ↓
PAID
```

Additional statuses:

```text
PARTIALLY_PAID
OVERDUE
CANCELLED
VOID
```

Payment integration is not part of the MVP.

Initially, payment status can be manually updated by authorized Admin users if payment tracking is required.

---

# 23. Editing Documents

The company requires flexibility to modify documents even after they have been created.

Therefore:

### Draft documents

Fully editable.

### Sent/issued documents

Admin can edit where business requirements require it.

However, the system must maintain revision history.

Example:

```text
INV-2026-0015

Version 1
Amount: $1,500
Created: 20-Aug-2026

Version 2
Amount: $1,650
Modified: 22-Aug-2026
Reason: Client requested change
```

The system should store:

- Version number
- Modified by
- Modified date
- Reason for change
- Previous values
- New values

The latest version is the current document.

---

# 24. Document Templates

Templates are a core feature.

The application should initially contain:

## Invoice Templates

At least 3 professional templates.

Example:

```text
Modern
Classic
Corporate
```

## Quotation Templates

At least 3 professional templates.

Example:

```text
Modern
Classic
Corporate
```

Templates should be reusable.

Do not hard-code the document design directly into individual invoice/quotation components.

---

# 25. Template Engine

Use a data-driven template system.

Concept:

```text
Document Data
+
Template Configuration
+
Company Branding
        ↓
PDF Renderer
        ↓
Final PDF
```

Example data:

```json
{
  "invoiceNumber": "INV-2026-0001",
  "customer": {},
  "items": [],
  "currency": "USD",
  "subtotal": 1000,
  "tax": 180,
  "total": 1180
}
```

Template configuration controls how that data appears.

---

# 26. Template Customization

Admin should be able to customize:

## Branding

- Logo
- Logo position
- Logo size
- Primary color
- Secondary color

## Typography

- Font family
- Font size
- Heading size
- Table font size

## Layout

- Header
- Footer
- Margins
- Spacing
- Table style

## Visibility

Allow Admin to show/hide:

- Billing address
- Shipping address
- GST details
- Bank details
- Payment instructions
- Notes
- Terms
- Signature
- Customer message

---

# 27. Logo Management

Admin should be able to:

- Upload logo
- Replace logo
- Remove logo
- Preview logo

Supported formats:

```text
PNG
JPG/JPEG
SVG
```

Recommended:

```text
Maximum file size: configurable
```

The logo should be stored separately from document data.

---

# 28. Template Versioning

Templates should have versions.

Example:

```text
Invoice Template
    v1
    v2
    v3
```

When an invoice is issued, store the template version used.

Historical invoices should remain associated with their original template version.

---

# 29. PDF Generation

The backend should generate the final PDF.

Requirements:

- A4 format
- Professional typography
- Company branding
- Correct page breaks
- Multi-page invoices
- Page numbers
- Header/footer
- Tax summary
- Currency formatting
- Terms and conditions
- Bank details
- Signature section

The PDF should be downloadable.

---

# 30. PDF Storage

Generated documents should be stored.

Example:

```text
/documents/
    quotations/
        2026/
            QT-2026-0001.pdf

    invoices/
        2026/
            INV-2026-0001.pdf
```

However, actual storage implementation should preferably use object storage rather than relying on the application server filesystem.

---

# 31. Sharing

The first version should support:

## Download

Download PDF directly.

## Email

Admin can send:

```text
To
CC
Subject
Message
Attachment
```

The generated PDF should be attached automatically.

## WhatsApp

Initially, provide a share workflow.

Possible options:

```text
Share PDF
Copy secure document link
Open WhatsApp
```

A fully automated WhatsApp Business API integration can be added later.

---

# 32. Multi-Currency

The system must support multiple currencies.

At minimum:

```text
INR
USD
```

The currency dropdown should support a broader global currency list.

Example:

```text
INR - Indian Rupee
USD - US Dollar
EUR - Euro
GBP - British Pound
AED - UAE Dirham
SGD - Singapore Dollar
AUD - Australian Dollar
CAD - Canadian Dollar
JPY - Japanese Yen
CHF - Swiss Franc
```

The selected currency must be stored directly on the quotation/invoice.

Example:

```text
currency_code = USD
currency_symbol = $
```

Do not dynamically derive historical document currency from global settings.

---

# 33. Currency Formatting

Formatting should respect the selected currency.

Example:

```text
INR

₹1,25,000.00
```

```text
USD

$1,500.00
```

The system should support correct decimal precision per currency.

---

# 34. GST / Tax Engine

The application should support Indian GST.

Initial tax types:

```text
CGST
SGST
IGST
UTGST
Exempt
Zero Rated
Non-GST
```

The tax engine should be configurable rather than hard-coded.

Example:

```text
Taxable Value = ₹100,000

CGST 9% = ₹9,000
SGST 9% = ₹9,000

Total = ₹118,000
```

Interstate example:

```text
Taxable Value = ₹100,000

IGST 18% = ₹18,000

Total = ₹118,000
```

The system should support tax breakdowns in the PDF.

---

# 35. E-Invoice / IRN

Explicitly excluded from the current scope.

Do NOT implement:

- IRN generation
- E-invoice API
- QR-code generation for government e-invoice
- GSTN e-invoice submission

Architecture may leave room for future integration, but no development effort should be spent on it in the MVP.

---

# 36. Bank Payment Details

Since customers initially pay directly to the company's bank account, invoices should display configurable bank/payment information.

Example:

```text
Payment Details

Bank Name:
Account Name:
Account Number:
IFSC:
SWIFT:
Branch:

Payment Reference:
Please mention invoice number while making payment.
```

Payment gateway integration is future scope.

---

# 37. Reports

Initial reports:

## Quotation Report

Filters:

- Date
- Customer
- Status
- Currency
- Amount

Columns:

```text
Quote No
Customer
Date
Expiry
Currency
Amount
Status
```

## Invoice Report

Filters:

- Date
- Customer
- Status
- Currency
- Amount

Columns:

```text
Invoice No
Customer
Date
Due Date
Currency
Amount
Status
```

## Customer Report

Show:

- Customer
- Quotations
- Invoices
- Total quotation value
- Total invoice value

## Monthly Summary

Show:

- Monthly quotations
- Monthly invoices
- Monthly value

---

# 38. Export

Finance Viewer must be able to export data.

Supported formats:

```text
CSV
Excel/XLSX
PDF
```

Exports should respect the currently applied filters.

Example:

```text
Date: Apr 1 – Aug 24
Customer: All
Status: Paid
Currency: INR
```

Export only the filtered result.

---

# 39. Bulk Download

Finance Viewer and Admin should be able to bulk-download PDFs where permitted.

Example:

```text
Select 20 invoices
        ↓
Bulk Download
        ↓
ZIP
        ↓
invoice_001.pdf
invoice_002.pdf
...
```

This is useful for Finance operations.

---

# 40. Audit Logs

All important actions should be recorded.

Examples:

```text
Quotation Created
Quotation Edited
Quotation Sent
Quotation Accepted
Quotation Converted
Invoice Created
Invoice Edited
Invoice Sent
Invoice Cancelled
Template Changed
Customer Updated
User Created
Permission Changed
Document Downloaded
Document Exported
```

Audit log fields:

```text
User
Action
Entity Type
Entity ID
Timestamp
IP Address
Previous Value
New Value
```

Audit logs must not be editable by normal users.

---

# 41. Data Retention

The company wants permanent storage.

Therefore:

- No automatic deletion.
- No automatic document expiry deletion.
- Historical invoices remain available.
- Historical quotations remain available.
- Audit records remain available.
- Generated PDFs remain available.

Deletion should be restricted.

For financial documents, prefer:

```text
Archive
Cancel
Void
```

instead of permanent deletion.

---

# 42. Search

Global search should support:

```text
Invoice Number
Quotation Number
Customer Name
Customer Email
Customer Code
Item Name
Reference Number
```

Example:

```text
Search: INV-2026-0025
```

should immediately locate the invoice.

---

# 43. Filters

Quotation filters:

```text
Date
Status
Customer
Currency
Amount
Created By
```

Invoice filters:

```text
Date
Status
Customer
Currency
Amount
Created By
```

---

# 44. Recommended UI Layout

## Sidebar

```text
Dashboard

Sales
 ├── Quotations
 └── Invoices

Masters
 ├── Customers
 └── Products / Services

Templates

Reports

Administration
 ├── Users & Roles
 ├── Company Settings
 └── Audit Logs
```

Finance Viewer sidebar:

```text
Dashboard

Quotations
Invoices
Customers
Reports
Downloads
```

Do not show administration modules to Finance Viewer.

---

# 45. Quotation List UI

Recommended structure:

```text
---------------------------------------------------------
Quotations

[Search] [Status] [Customer] [Date] [+ New Quotation]

---------------------------------------------------------
Quote No | Customer | Date | Expiry | Amount | Status | Actions
---------------------------------------------------------
QT-0001  | ABC Ltd  | ...  | ...    | ₹50,000 | Sent | ...
QT-0002  | XYZ Ltd  | ...  | ...    | $2,000  | Accepted | ...
---------------------------------------------------------
```

---

# 46. Invoice List UI

```text
---------------------------------------------------------
Invoices

[Search] [Status] [Customer] [Date] [+ New Invoice]

---------------------------------------------------------
Invoice | Customer | Date | Due Date | Amount | Status
---------------------------------------------------------
INV-001 | ABC Ltd  | ...  | ...      | ₹50,000 | Paid
INV-002 | XYZ Ltd  | ...  | ...      | $2,000  | Sent
---------------------------------------------------------
```

---

# 47. Invoice Creation UI

Recommended layout:

```text
---------------------------------------------------------
Create Invoice

Invoice No       Invoice Date       Due Date
INV-2026-0015    24-Aug-2026        23-Sep-2026

Customer
[ Select Customer ]

Currency
[ USD ▼ ]

---------------------------------------------------------
Items

Item | Description | Qty | Rate | Tax | Amount
---------------------------------------------------------
     |             |     |      |     |
     |             |     |      |     |

[ + Add Item ]

---------------------------------------------------------

Subtotal
Discount
Tax
Adjustment
----------------
Grand Total

---------------------------------------------------------

Notes
Terms & Conditions
Payment Details

Template
[ Corporate ▼ ]

[ Save Draft ] [ Preview ] [ Generate PDF ] [ Send ]
---------------------------------------------------------
```

---

# 48. Quotation Creation UI

Use the same general structure as invoice creation.

Differences:

```text
Quotation Number
Quotation Date
Expiry Date
```

Primary action:

```text
Save Draft
Preview
Send
Mark Accepted
Convert to Invoice
```

---

# 49. Template Management UI

```text
Templates

[Invoice] [Quotation]

------------------------------------------------
Template Name | Version | Status | Default | Actions
------------------------------------------------
Corporate     | v3      | Active | Yes     | Edit
Modern        | v2      | Active | No      | Edit
Classic       | v1      | Active | No      | Edit
------------------------------------------------

[ + Create Template ]
```

---

# 50. Template Editor

The template editor should ideally have:

```text
---------------------------------------------------------
Template Editor

LEFT                       RIGHT
Configuration              Live Preview

Logo                       ┌───────────────────┐
Colors                     │                   │
Typography                 │ Invoice           │
Header                     │                   │
Customer                   │ Customer          │
Items                      │ Items             │
Totals                     │ Total             │
Bank Details               │                   │
Terms                      │ Terms             │
Footer                     │                   │
                           └───────────────────┘
```

Changes should update the preview.

---

# 51. Database Design

Recommended core entities:

```text
users
roles
permissions
role_permissions

company_settings

customers
customer_addresses

items
item_categories

templates
template_versions

quotations
quotation_items
quotation_revisions

invoices
invoice_items
invoice_revisions

documents
document_files

audit_logs

currencies
tax_types
financial_years
```

---

# 52. Suggested Database Fields

## users

```text
id
name
email
role_id
status
created_at
updated_at
last_login
```

## customers

```text
id
customer_code
name
company_name
email
phone
tax_id
billing_address
shipping_address
currency
payment_terms
status
created_at
updated_at
```

## items

```text
id
item_code
name
description
type
unit
default_rate
currency
tax_type
tax_rate
status
created_at
updated_at
```

## quotations

```text
id
quotation_number
financial_year_id
customer_id
currency_code
quotation_date
expiry_date
status
subtotal
discount
tax
adjustment
total
template_id
template_version
notes
terms
created_by
created_at
updated_at
```

## invoices

```text
id
invoice_number
financial_year_id
quotation_id
customer_id
currency_code
invoice_date
due_date
status
subtotal
discount
tax
adjustment
total
template_id
template_version
notes
terms
created_by
created_at
updated_at
```

---

# 53. Revision Tables

Because documents can be edited after creation, maintain revision history.

Example:

```text
quotation_revisions
invoice_revisions
```

Fields:

```text
id
document_id
version
changed_by
change_reason
previous_data
new_data
created_at
```

JSON snapshots can be stored for previous states.

---

# 54. API Architecture

Recommended REST API structure.

## Authentication

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Customers

```text
GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
PATCH  /api/customers/:id
```

## Items

```text
GET    /api/items
POST   /api/items
GET    /api/items/:id
PATCH  /api/items/:id
```

## Templates

```text
GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PATCH  /api/templates/:id
POST   /api/templates/:id/duplicate
```

## Quotations

```text
GET    /api/quotations
POST   /api/quotations
GET    /api/quotations/:id
PATCH  /api/quotations/:id
POST   /api/quotations/:id/send
POST   /api/quotations/:id/convert
GET    /api/quotations/:id/pdf
GET    /api/quotations/:id/history
```

## Invoices

```text
GET    /api/invoices
POST   /api/invoices
GET    /api/invoices/:id
PATCH  /api/invoices/:id
POST   /api/invoices/:id/send
GET    /api/invoices/:id/pdf
GET    /api/invoices/:id/history
```

## Reports

```text
GET /api/reports/invoices
GET /api/reports/quotations
GET /api/reports/customers
GET /api/reports/summary
```

## Exports

```text
GET /api/export/invoices
GET /api/export/quotations
GET /api/export/customers
```

---

# 55. Backend Business Rules

The backend must:

1. Generate invoice numbers.
2. Generate quotation numbers.
3. Calculate totals.
4. Calculate taxes.
5. Validate customer information.
6. Validate line items.
7. Validate currency.
8. Validate permissions.
9. Create revisions.
10. Create audit records.
11. Generate PDFs.
12. Store documents.
13. Prevent duplicate document numbers.
14. Validate template versions.
15. Maintain financial year association.

Never trust financial calculations submitted by the frontend.

---

# 56. Financial Calculation Rules

Use decimal-safe calculations.

Avoid JavaScript floating-point calculations such as:

```javascript
0.1 + 0.2
```

for financial persistence.

Recommended:

- Decimal database types
- Decimal arithmetic library
- Server-side calculations
- Consistent rounding rules

Example:

```text
Quantity × Rate
= Line Amount

Sum(Line Amounts)
= Subtotal

Subtotal - Discount
= Taxable Amount

Taxable Amount + Tax
= Total
```

---

# 57. Security

Requirements:

- Secure authentication
- Role-based access control
- API-level authorization
- Password hashing if credentials are managed internally
- Session/token security
- Rate limiting
- Input validation
- File-upload validation
- Secure PDF storage
- Secure download URLs
- Audit logs
- Database backups
- HTTPS
- Protection against SQL injection
- Protection against XSS
- Protection against CSRF where applicable

---

# 58. File Uploads

Supported:

```text
Company Logo
Invoice Attachments
Quotation Attachments
```

Validate:

- MIME type
- File extension
- File size
- File content where possible

Do not allow arbitrary executable files.

---

# 59. Document Lifecycle

## Quotation

```text
DRAFT
  ↓
SENT
  ↓
VIEWED
  ↓
ACCEPTED
  ↓
CONVERTED

Alternative:

DECLINED
EXPIRED
CANCELLED
```

## Invoice

```text
DRAFT
  ↓
ISSUED
  ↓
SENT
  ↓
VIEWED
  ↓
PAID
```

Alternative:

```text
PARTIALLY_PAID
OVERDUE
CANCELLED
VOID
```

---

# 60. Future Payment Architecture

Payment integration is not part of MVP.

However, architecture should allow:

```text
Invoice
   ↓
Payment Link
   ↓
Payment Gateway
   ↓
Webhook
   ↓
Payment Record
   ↓
Invoice Status = PAID
```

Potential future gateways:

- Razorpay
- Stripe
- Zoho Payments
- Other company-approved gateway

---

# 61. Future Customer Portal

Not part of MVP.

Future workflow:

```text
Customer receives quotation
        ↓
Secure Link
        ↓
Customer Portal
        ↓
View Quote
        ↓
Approve / Reject
        ↓
Admin notified
        ↓
Convert to Invoice
```

Future invoice workflow:

```text
Invoice
 ↓
Customer Portal
 ↓
View Invoice
 ↓
Download
 ↓
Pay
```

---

# 62. Future Recurring Invoice Module

Possible future use cases:

- Monthly maintenance
- Hosting
- Support contracts
- Subscription services

Example:

```text
Every Month
     ↓
Generate Invoice
     ↓
Send Customer
```

---

# 63. Future Reminder System

Future automated reminders:

```text
Before Due Date
    ↓
Reminder

Due Date
    ↓
Reminder

After Due Date
    ↓
Overdue Reminder
```

Email/WhatsApp reminder templates should be configurable.

---

# 64. Future Expenses

Potential future module:

```text
Expense
 ↓
Customer
 ↓
Billable?
 ↓
Yes
 ↓
Add to Invoice
```

---

# 65. Future Projects & Timesheets

Potential future workflow:

```text
Project
 ↓
Tasks
 ↓
Employee Timesheet
 ↓
Billable Hours
 ↓
Invoice
```

This is useful if the IT department later wants project-based billing.

---

# 66. Future Accounting Integration

Not required initially.

Possible future integrations:

```text
Tally
Zoho Books
ERP
Accounting Software
```

The API architecture should make this possible later.

---

# 67. Development Phases

## Phase 1 — Foundation

Build:

- Authentication
- Roles
- Permissions
- Company settings
- Financial year
- Database
- Audit system

---

## Phase 2 — Masters

Build:

- Customers
- Products/services
- Currencies
- Tax types

---

## Phase 3 — Templates

Build:

- Invoice templates
- Quotation templates
- Logo upload
- Branding
- Template editor
- Live preview
- Template versioning

---

## Phase 4 — Quotations

Build:

- Quotation CRUD
- Items
- Calculations
- Taxes
- Status
- PDF
- Email
- WhatsApp sharing
- Download
- Revision history

---

## Phase 5 — Invoices

Build:

- Invoice CRUD
- Quotation conversion
- Calculations
- Taxes
- PDF
- Email
- WhatsApp sharing
- Download
- Revision history

---

## Phase 6 — Finance

Build:

- Finance Viewer
- Dashboard
- Reports
- CSV export
- XLSX export
- PDF reports
- Bulk downloads

---

# 68. MVP Acceptance Criteria

The MVP is considered complete when:

### Customers

- Admin can create customers.
- Admin can edit customers.
- Admin can view customer history.

### Products

- Admin can create products/services.
- Admin can edit products/services.

### Templates

- At least 3 invoice templates exist.
- At least 3 quotation templates exist.
- Admin can upload logo.
- Admin can change branding.
- Admin can select templates.
- Templates have versions.

### Quotations

- Admin can create quotations.
- Admin can edit quotations.
- Admin can preview quotations.
- Admin can generate PDFs.
- Admin can download PDFs.
- Admin can send quotations.
- Admin can share quotations.
- Admin can change quotation status.
- Admin can convert quotation to invoice.

### Invoices

- Admin can create invoices.
- Admin can edit invoices.
- Admin can create invoice from quotation.
- Admin can preview invoice.
- Admin can generate PDF.
- Admin can download invoice.
- Admin can send invoice.
- Admin can share invoice.
- Admin can change invoice status.

### Finance

- Finance Viewer can view records.
- Finance Viewer cannot modify records.
- Finance Viewer can download documents.
- Finance Viewer can export data.

### Security

- Role-based permissions work.
- API-level authorization works.
- Audit logs work.
- Financial documents are permanently retained.
- Revision history is available.

---

# 69. Recommended Tech Architecture

Use the company's existing technology standards where possible.

A possible architecture:

```text
Frontend
    ↓
REST API
    ↓
Backend
    ↓
Database
    ↓
Object Storage
```

Suggested technologies:

### Frontend

React + TypeScript

or

Angular + TypeScript

Use the framework already standardized by the company's development team.

### Backend

Node.js + TypeScript

Possible:

```text
Express
```

or

```text
NestJS
```

### Database

Recommended:

```text
MySQL
```

or

```text
PostgreSQL
```

### Storage

S3-compatible object storage.

### PDF

Server-side HTML/CSS → PDF rendering.

### Email

Use a transactional email provider.

### Deployment

Containerized deployment with CI/CD.

---

# 70. Important Architecture Principle

The system should have four clearly separated layers:

```text
1. Business Data
       ↓
2. Document Engine
       ↓
3. Template Engine
       ↓
4. PDF / Delivery
```

Do not mix invoice calculation logic with PDF layout logic.

For example:

```text
Invoice Service
    ↓
Calculates:
Subtotal
Discount
Tax
Total

        ↓

Document JSON

        ↓

Template Engine

        ↓

PDF
```

This makes the system much easier to maintain.

---

# 71. Recommended Folder Structure

Example frontend:

```text
src/
├── app/
│
├── modules/
│   ├── dashboard/
│   ├── customers/
│   ├── items/
│   ├── quotations/
│   ├── invoices/
│   ├── templates/
│   ├── reports/
│   ├── users/
│   ├── settings/
│   └── audit/
│
├── components/
│
├── services/
│
├── guards/
│
├── models/
│
├── utils/
│
└── shared/
```

Backend:

```text
src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── customers/
│   ├── items/
│   ├── quotations/
│   ├── invoices/
│   ├── templates/
│   ├── reports/
│   ├── audit/
│   └── settings/
│
├── middleware/
├── services/
├── utils/
├── database/
└── config/
```

---

# 72. Important Development Rules for Claude

When implementing this project:

1. Do not build the entire system in one step.
2. Build module-by-module.
3. Finish database design before implementing complex business logic.
4. Build reusable components.
5. Do not duplicate invoice and quotation logic unnecessarily.
6. Create reusable document/item/tax calculation components.
7. Keep PDF rendering separate from UI.
8. Implement RBAC from the beginning.
9. Implement audit logging from the beginning.
10. Use TypeScript types/interfaces consistently.
11. Validate all API inputs.
12. Never trust frontend totals.
13. Never generate document numbers on the client.
14. Use database transactions for document creation.
15. Use reusable form components.
16. Keep template configuration data-driven.
17. Do not hard-code company information into components.
18. Do not hard-code tax rates into invoice components.
19. Do not hard-code currencies.
20. Keep future payment integration possible without implementing it now.

---

# 73. Claude Development Workflow

When using this PRD with Claude, follow this sequence.

## Step 1

Ask Claude to analyze this PRD and identify:

- Missing requirements
- Technical risks
- Database relationships
- API dependencies
- UI dependencies

Do not start coding immediately.

## Step 2

Ask Claude to create the complete:

```text
Database schema
ER diagram
API specification
Authentication architecture
RBAC architecture
```

## Step 3

Review and finalize the architecture.

## Step 4

Build:

```text
Authentication
Roles
Company Settings
Financial Year
```

## Step 5

Build:

```text
Customers
Products / Services
Currencies
Tax configuration
```

## Step 6

Build:

```text
Template Engine
```

## Step 7

Build:

```text
Quotation Module
```

## Step 8

Build:

```text
Invoice Module
```

## Step 9

Build:

```text
PDF
Email
WhatsApp sharing
```

## Step 10

Build:

```text
Finance Viewer
Reports
Exports
Audit
```

---

# 74. Suggested First Claude Prompt

Use this as the first prompt after providing this PRD:

> Read the complete Product Requirements Document carefully. Do not start implementing the application yet.
>
> First analyze the requirements and produce:
>
> 1. System architecture
> 2. Frontend architecture
> 3. Backend architecture
> 4. Database ER diagram
> 5. Complete database schema
> 6. API specification
> 7. Authentication and RBAC architecture
> 8. Invoice/quotation document model
> 9. Template engine architecture
> 10. PDF generation architecture
> 11. File/document storage architecture
> 12. Audit/revision architecture
> 13. Recommended development phases
> 14. Technical risks
> 15. Any missing requirements that need clarification
>
> Do not write production code yet.
>
> Where requirements are ambiguous, identify the ambiguity and recommend the most appropriate solution based on the PRD.
>
> Keep the architecture modular so future features such as online payments, recurring invoices, customer portal, expenses, projects, timesheets and accounting integrations can be added later without rewriting the core system.

---

# 75. Final Product Scope

The initial product should be understood as:

```text
                 INTERNAL BILLING SYSTEM

                       ADMIN
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    Customers          Items          Templates
        │                │                │
        └────────────────┼────────────────┘
                         │
                ┌────────┴────────┐
                │                 │
           QUOTATIONS          INVOICES
                │                 │
                │                 │
             Approval             │
                │                 │
                └───────┬─────────┘
                        │
                 Document Engine
                        │
              ┌─────────┼─────────┐
              │         │         │
             PDF      Email    WhatsApp
              │
              ▼
           Downloads
              │
              ▼
        FINANCE VIEWER
              │
       ┌──────┴───────┐
       │              │
      View          Export
```

The MVP should be **small, stable, and highly reusable**, while the underlying architecture should be capable of evolving toward a broader Zoho-like billing platform.

---

# 76. Out of Scope for MVP

The following should NOT be implemented in the initial version:

- Online payment gateway
- Customer portal
- Customer self-service approval
- E-Invoice / IRN
- GSTN e-invoice integration
- Recurring invoices
- Automatic payment reminders
- Automatic payment reconciliation
- Expense management
- Project management
- Timesheets
- Accounting integrations
- Multi-company support
- Multi-tenant architecture
- Advanced AI features

These should remain future roadmap items.

---

# 77. Definition of Success

The system is successful when an authorized IT/Admin user can complete this entire workflow without external tools:

```text
Login
  ↓
Select/Create Customer
  ↓
Create Quotation
  ↓
Select Template
  ↓
Apply Company Logo
  ↓
Add Products/Services
  ↓
Apply Currency
  ↓
Apply GST/Tax
  ↓
Preview
  ↓
Generate PDF
  ↓
Send via Email / WhatsApp
  ↓
Mark Accepted
  ↓
Convert to Invoice
  ↓
Generate Invoice PDF
  ↓
Send to Customer
  ↓
Finance Viewer Opens System
  ↓
Views Invoice
  ↓
Exports Data
  ↓
Downloads Invoice
```

This is the **core business workflow** that the first version should optimize for.