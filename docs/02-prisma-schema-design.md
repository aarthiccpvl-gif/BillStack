# 02 — Prisma Schema Design (draft for review)

This is the **proposed** schema for Phase 2. It is intentionally a design document — nothing has been
generated or migrated yet. Names use Prisma camelCase with `@@map`/`@map` to snake_case tables and
columns, so the SQL matches PRD §51/§52 naming while the TypeScript reads naturally.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

/* ─────────────────────────── enums ─────────────────────────── */

enum UserStatus            { ACTIVE INACTIVE LOCKED }
enum RecordStatus          { ACTIVE INACTIVE ARCHIVED }
enum DocType               { QUOTATION INVOICE CREDIT_NOTE }        // CREDIT_NOTE reserved, unused
enum EntityType            { QUOTATION INVOICE CUSTOMER ITEM TEMPLATE COMPANY USER REPORT }
enum ItemType              { PRODUCT SERVICE }
enum AddressType           { BILLING SHIPPING OTHER }
enum DiscountMode          { NONE PERCENT AMOUNT }
enum SymbolPosition        { PREFIX SUFFIX }
enum SeparatorStyle        { WESTERN INDIAN }
enum FinancialYearStatus   { OPEN CLOSED }
enum ResetPolicy           { FINANCIAL_YEAR NEVER }
enum TaxScope              { INTRA_STATE INTER_STATE UNION_TERRITORY NONE }
enum TaxTreatment          { REGISTERED UNREGISTERED COMPOSITION OVERSEAS SEZ }
enum TemplateStatus        { DRAFT PUBLISHED ARCHIVED }
enum FileKind              { GENERATED_PDF ATTACHMENT LOGO SIGNATURE FAVICON REPORT }
enum ShareChannel          { LINK EMAIL WHATSAPP }
enum EmailStatus           { QUEUED SENT FAILED }
enum PaymentMethod         { BANK_TRANSFER CHEQUE CASH UPI CARD OTHER }

enum QuotationStatus {
  DRAFT SENT VIEWED ACCEPTED DECLINED EXPIRED CONVERTED CANCELLED
}

enum InvoiceStatus {
  DRAFT ISSUED SENT VIEWED PARTIALLY_PAID PAID OVERDUE CANCELLED VOID
}

enum AuditAction {
  LOGIN LOGIN_FAILED LOGOUT
  USER_CREATED USER_UPDATED ROLE_CHANGED PASSWORD_CHANGED
  SETTINGS_UPDATED COMPANY_LOGO_UPDATED BANK_ACCOUNT_UPDATED
  CUSTOMER_CREATED CUSTOMER_UPDATED CUSTOMER_ARCHIVED
  ITEM_CREATED ITEM_UPDATED ITEM_ARCHIVED
  MASTER_CREATED MASTER_UPDATED
  TEMPLATE_CREATED TEMPLATE_UPDATED TEMPLATE_VERSION_PUBLISHED TEMPLATE_DEFAULT_CHANGED
  QUOTATION_CREATED QUOTATION_UPDATED QUOTATION_SENT QUOTATION_VIEWED
  QUOTATION_ACCEPTED QUOTATION_DECLINED QUOTATION_EXPIRED QUOTATION_CONVERTED
  QUOTATION_CANCELLED QUOTATION_DELETED
  INVOICE_CREATED INVOICE_UPDATED INVOICE_ISSUED INVOICE_SENT INVOICE_VIEWED
  INVOICE_CANCELLED INVOICE_VOIDED INVOICE_DELETED PAYMENT_RECORDED
  DOCUMENT_PDF_GENERATED DOCUMENT_DOWNLOADED DOCUMENT_SHARED
  REPORT_EXPORTED BULK_DOWNLOAD
}

/* ───────────────────── identity & access ───────────────────── */

model Role {
  id          Int      @id @default(autoincrement())
  key         String   @unique @db.VarChar(50)      // SUPER_ADMIN | ADMIN | FINANCE_VIEWER
  name        String   @db.VarChar(100)
  description String?  @db.VarChar(255)
  isSystem    Boolean  @default(true)
  users       User[]
  permissions RolePermission[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("roles")
}

model Permission {
  id          Int      @id @default(autoincrement())
  key         String   @unique @db.VarChar(80)      // e.g. "invoice.create"
  module      String   @db.VarChar(40)
  action      String   @db.VarChar(40)
  description String?  @db.VarChar(255)
  roles       RolePermission[]
  @@map("permissions")
}

model RolePermission {
  roleId       Int
  permissionId Int
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model User {
  id               Int        @id @default(autoincrement())
  name             String     @db.VarChar(150)
  email            String     @unique @db.VarChar(190)
  passwordHash     String     @db.VarChar(255)
  roleId           Int
  role             Role       @relation(fields: [roleId], references: [id])
  status           UserStatus @default(ACTIVE)
  phone            String?    @db.VarChar(30)
  lastLoginAt      DateTime?
  failedLoginCount Int        @default(0)
  lockedUntil      DateTime?
  mustChangePassword Boolean  @default(false)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  refreshTokens    RefreshToken[]
  auditLogs        AuditLog[]
  quotationsCreated Quotation[] @relation("QuotationCreatedBy")
  invoicesCreated   Invoice[]   @relation("InvoiceCreatedBy")
  @@index([roleId])
  @@map("users")
}

model RefreshToken {
  id           BigInt   @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id])
  tokenHash    String   @unique @db.VarChar(255)
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById BigInt?
  ip           String?  @db.VarChar(64)
  userAgent    String?  @db.VarChar(255)
  createdAt    DateTime @default(now())
  @@index([userId, expiresAt])
  @@map("refresh_tokens")
}

/* ──────────────── company & configuration ─────────────────── */

model CompanySettings {
  id                     Int      @id @default(1)
  companyName            String   @db.VarChar(200)
  legalName              String?  @db.VarChar(200)
  addressLine1           String?  @db.VarChar(255)
  addressLine2           String?  @db.VarChar(255)
  city                   String?  @db.VarChar(100)
  state                  String?  @db.VarChar(100)
  stateCode              String?  @db.VarChar(4)     // GST state code — place of supply
  country                String?  @db.VarChar(100)
  postalCode             String?  @db.VarChar(20)
  phone                  String?  @db.VarChar(40)
  email                  String?  @db.VarChar(190)
  website                String?  @db.VarChar(190)
  gstin                  String?  @db.VarChar(20)
  pan                    String?  @db.VarChar(20)
  cin                    String?  @db.VarChar(30)
  otherRegistrations     Json?
  logoFileId             BigInt?
  faviconFileId          BigInt?
  signatureFileId        BigInt?
  primaryColor           String   @default("#0d6efd") @db.VarChar(9)
  secondaryColor         String   @default("#6c757d") @db.VarChar(9)
  defaultFont            String   @default("Inter")   @db.VarChar(60)
  baseCurrencyCode       String   @default("INR")     @db.Char(3)
  financialYearStartMonth Int     @default(4)
  defaultInvoiceTemplateId   Int?
  defaultQuotationTemplateId Int?
  defaultTermsInvoice    String?  @db.Text
  defaultTermsQuotation  String?  @db.Text
  defaultNotes           String?  @db.Text
  updatedBy              Int?
  updatedAt              DateTime @updatedAt
  bankAccounts           CompanyBankAccount[]
  @@map("company_settings")
}

model CompanyBankAccount {
  id                  Int      @id @default(autoincrement())
  companyId           Int      @default(1)
  company             CompanySettings @relation(fields: [companyId], references: [id])
  bankName            String   @db.VarChar(150)
  accountName         String   @db.VarChar(150)
  accountNumber       String   @db.VarChar(60)
  ifsc                String?  @db.VarChar(20)
  swift               String?  @db.VarChar(20)
  branch              String?  @db.VarChar(150)
  currencyCode        String?  @db.Char(3)
  paymentInstructions String?  @db.Text
  isDefault           Boolean  @default(false)
  status              RecordStatus @default(ACTIVE)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@map("company_bank_accounts")
}

model AppSetting {
  key       String   @id @db.VarChar(80)
  valueJson Json
  updatedBy Int?
  updatedAt DateTime @updatedAt
  @@map("app_settings")
}

model FinancialYear {
  id         Int      @id @default(autoincrement())
  code       String   @unique @db.VarChar(9)     // "2026-27"
  startDate  DateTime @db.Date
  endDate    DateTime @db.Date
  isCurrent  Boolean  @default(false)
  status     FinancialYearStatus @default(OPEN)
  createdAt  DateTime @default(now())
  quotations Quotation[]
  invoices   Invoice[]
  sequences  DocumentSequence[]
  @@index([startDate, endDate])
  @@map("financial_years")
}

model NumberingSeries {
  id          Int      @id @default(autoincrement())
  docType     DocType
  prefix      String   @db.VarChar(20)
  pattern     String   @db.VarChar(80)   // "{PREFIX}-{FY_START}-{SEQ}"
  padding     Int      @default(4)
  startNumber Int      @default(1)
  resetPolicy ResetPolicy @default(FINANCIAL_YEAR)
  isActive    Boolean  @default(true)
  sequences   DocumentSequence[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([docType, isActive])
  @@map("numbering_series")
}

model DocumentSequence {
  id                Int      @id @default(autoincrement())
  numberingSeriesId Int
  series            NumberingSeries @relation(fields: [numberingSeriesId], references: [id])
  financialYearId   Int?
  financialYear     FinancialYear?  @relation(fields: [financialYearId], references: [id])
  lastNumber        Int      @default(0)
  updatedAt         DateTime @updatedAt
  @@unique([numberingSeriesId, financialYearId])
  @@map("document_sequences")
}

model Currency {
  code              String   @id @db.Char(3)
  name              String   @db.VarChar(80)
  symbol            String   @db.VarChar(8)
  decimalPlaces     Int      @default(2)
  symbolPosition    SymbolPosition  @default(PREFIX)
  separatorStyle    SeparatorStyle  @default(WESTERN)
  isActive          Boolean  @default(true)
  sortOrder         Int      @default(0)
  customers         Customer[]
  items             Item[]
  quotations        Quotation[]
  invoices          Invoice[]
  @@map("currencies")
}

model ExchangeRate {
  id            BigInt   @id @default(autoincrement())
  fromCurrency  String   @db.Char(3)
  toCurrency    String   @db.Char(3)
  rate          Decimal  @db.Decimal(18, 8)
  effectiveDate DateTime @db.Date
  source        String   @default("MANUAL") @db.VarChar(30)
  createdBy     Int?
  createdAt     DateTime @default(now())
  @@unique([fromCurrency, toCurrency, effectiveDate])
  @@map("exchange_rates")
}

model TaxType {
  id        Int      @id @default(autoincrement())
  key       String   @unique @db.VarChar(20)   // CGST SGST IGST UTGST EXEMPT ZERO_RATED NON_GST
  name      String   @db.VarChar(80)
  scope     TaxScope @default(NONE)
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  rates     TaxRate[]
  @@map("tax_types")
}

model TaxRate {
  id            Int      @id @default(autoincrement())
  taxTypeId     Int
  taxType       TaxType  @relation(fields: [taxTypeId], references: [id])
  name          String   @db.VarChar(80)          // "CGST 9%"
  rate          Decimal  @db.Decimal(9, 4)
  effectiveFrom DateTime? @db.Date
  effectiveTo   DateTime? @db.Date
  isActive      Boolean  @default(true)
  items         Item[]
  groupLinks    TaxGroupRate[]
  quotationTaxes QuotationItemTax[]
  invoiceTaxes   InvoiceItemTax[]
  @@index([taxTypeId, isActive])
  @@map("tax_rates")
}

model TaxGroup {
  id        Int      @id @default(autoincrement())
  name      String   @unique @db.VarChar(80)     // "GST 18% (Intra-state)"
  scope     TaxScope @default(NONE)
  isActive  Boolean  @default(true)
  rates     TaxGroupRate[]
  items     Item[]
  @@map("tax_groups")
}

model TaxGroupRate {
  taxGroupId Int
  taxRateId  Int
  group      TaxGroup @relation(fields: [taxGroupId], references: [id], onDelete: Cascade)
  rate       TaxRate  @relation(fields: [taxRateId],  references: [id])
  @@id([taxGroupId, taxRateId])
  @@map("tax_group_rates")
}

model Unit {
  id       Int    @id @default(autoincrement())
  code     String @unique @db.VarChar(20)     // NOS HRS DAY MONTH LOT LICENSE
  name     String @db.VarChar(60)
  isActive Boolean @default(true)
  items    Item[]
  @@map("units")
}

model ItemCategory {
  id       Int     @id @default(autoincrement())
  name     String  @unique @db.VarChar(100)
  parentId Int?
  status   RecordStatus @default(ACTIVE)
  items    Item[]
  @@map("item_categories")
}

/* ─────────────────────────── masters ──────────────────────── */

model Customer {
  id                       Int      @id @default(autoincrement())
  customerCode             String   @unique @db.VarChar(40)
  name                     String   @db.VarChar(200)
  companyName              String?  @db.VarChar(200)
  contactPerson            String?  @db.VarChar(150)
  email                    String?  @db.VarChar(190)
  phone                    String?  @db.VarChar(40)
  altPhone                 String?  @db.VarChar(40)
  gstin                    String?  @db.VarChar(20)
  pan                      String?  @db.VarChar(20)
  otherTaxId               String?  @db.VarChar(40)
  taxTreatment             TaxTreatment @default(REGISTERED)
  placeOfSupplyStateCode   String?  @db.VarChar(4)
  defaultCurrencyCode      String   @default("INR") @db.Char(3)
  currency                 Currency @relation(fields: [defaultCurrencyCode], references: [code])
  paymentTermsDays         Int      @default(30)
  notes                    String?  @db.Text
  status                   RecordStatus @default(ACTIVE)
  createdBy                Int?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  addresses                CustomerAddress[]
  contacts                 CustomerContact[]
  quotations               Quotation[]
  invoices                 Invoice[]
  @@index([name])
  @@index([status])
  @@map("customers")
}

model CustomerAddress {
  id         Int         @id @default(autoincrement())
  customerId Int
  customer   Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  type       AddressType
  label      String?     @db.VarChar(60)
  line1      String?     @db.VarChar(255)
  line2      String?     @db.VarChar(255)
  city       String?     @db.VarChar(100)
  state      String?     @db.VarChar(100)
  stateCode  String?     @db.VarChar(4)
  country    String?     @db.VarChar(100)
  postalCode String?     @db.VarChar(20)
  isDefault  Boolean     @default(false)
  @@index([customerId, type])
  @@map("customer_addresses")
}

model CustomerContact {
  id          Int      @id @default(autoincrement())
  customerId  Int
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  name        String   @db.VarChar(150)
  designation String?  @db.VarChar(100)
  email       String?  @db.VarChar(190)
  phone       String?  @db.VarChar(40)
  isPrimary   Boolean  @default(false)
  @@map("customer_contacts")
}

model Item {
  id                Int      @id @default(autoincrement())
  itemCode          String   @unique @db.VarChar(40)
  name              String   @db.VarChar(200)
  description       String?  @db.Text
  type              ItemType @default(SERVICE)
  unitId            Int?
  unit              Unit?    @relation(fields: [unitId], references: [id])
  defaultRate       Decimal  @db.Decimal(18, 4)
  currencyCode      String   @default("INR") @db.Char(3)
  currency          Currency @relation(fields: [currencyCode], references: [code])
  defaultTaxRateId  Int?
  defaultTaxRate    TaxRate? @relation(fields: [defaultTaxRateId], references: [id])
  defaultTaxGroupId Int?
  defaultTaxGroup   TaxGroup? @relation(fields: [defaultTaxGroupId], references: [id])
  hsnSacCode        String?  @db.VarChar(20)
  categoryId        Int?
  category          ItemCategory? @relation(fields: [categoryId], references: [id])
  status            RecordStatus  @default(ACTIVE)
  createdBy         Int?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  quotationItems    QuotationItem[]
  invoiceItems      InvoiceItem[]
  @@index([name])
  @@index([status])
  @@map("items")
}

/* ────────────────────────── templates ─────────────────────── */

model Template {
  id         Int      @id @default(autoincrement())
  key        String   @db.VarChar(40)      // corporate | modern | classic
  name       String   @db.VarChar(100)
  docType    DocType
  engineKey  String   @db.VarChar(40)      // renderer layout id
  description String? @db.VarChar(255)
  isDefault  Boolean  @default(false)
  status     RecordStatus @default(ACTIVE)
  createdBy  Int?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  versions   TemplateVersion[]
  @@unique([key, docType])
  @@map("templates")
}

model TemplateVersion {
  id          Int      @id @default(autoincrement())
  templateId  Int
  template    Template @relation(fields: [templateId], references: [id])
  version     Int
  configJson  Json                            // validated by TemplateConfigSchema
  changeNote  String?  @db.VarChar(255)
  status      TemplateStatus @default(DRAFT)
  publishedAt DateTime?
  createdBy   Int?
  createdAt   DateTime @default(now())
  quotations  Quotation[]
  invoices    Invoice[]
  @@unique([templateId, version])
  @@map("template_versions")
}

/* ───────────────────────── quotations ─────────────────────── */

model Quotation {
  id                      BigInt   @id @default(autoincrement())
  number                  String   @unique @db.VarChar(60)
  financialYearId         Int
  financialYear           FinancialYear @relation(fields: [financialYearId], references: [id])
  customerId              Int
  customer                Customer @relation(fields: [customerId], references: [id])
  customerSnapshot        Json
  billingAddressSnapshot  Json?
  shippingAddressSnapshot Json?
  companySnapshot         Json
  placeOfSupplyStateCode  String?  @db.VarChar(4)

  currencyCode            String   @db.Char(3)
  currency                Currency @relation(fields: [currencyCode], references: [code])
  currencySymbol          String   @db.VarChar(8)
  currencyDecimalPlaces   Int      @default(2)
  exchangeRateToBase      Decimal  @default(1) @db.Decimal(18, 8)
  baseCurrencyCode        String   @db.Char(3)
  baseTotal               Decimal  @db.Decimal(18, 4)

  documentDate            DateTime @db.Date
  expiryDate              DateTime? @db.Date
  referenceNumber         String?  @db.VarChar(80)
  subject                 String?  @db.VarChar(255)
  status                  QuotationStatus @default(DRAFT)

  discountMode            DiscountMode @default(NONE)
  discountValue           Decimal  @default(0) @db.Decimal(18, 4)
  subtotal                Decimal  @db.Decimal(18, 4)
  discountTotal           Decimal  @db.Decimal(18, 4)
  taxableTotal            Decimal  @db.Decimal(18, 4)
  taxTotal                Decimal  @db.Decimal(18, 4)
  adjustment              Decimal  @default(0) @db.Decimal(18, 4)
  roundOff                Decimal  @default(0) @db.Decimal(18, 4)
  grandTotal              Decimal  @db.Decimal(18, 4)
  taxSummaryJson          Json

  notes                   String?  @db.Text
  terms                   String?  @db.Text
  customerMessage         String?  @db.Text
  paymentInstructions     String?  @db.Text
  bankAccountId           Int?
  showBankDetails         Boolean  @default(true)

  templateId              Int
  templateVersionId       Int
  templateVersion         TemplateVersion @relation(fields: [templateVersionId], references: [id])
  currentVersion          Int      @default(1)
  customFieldsJson        Json?

  convertedInvoiceId      BigInt?  @unique
  sentAt                  DateTime?
  firstViewedAt           DateTime?
  acceptedAt              DateTime?
  declinedAt              DateTime?
  cancelledAt             DateTime?
  cancelReason            String?  @db.VarChar(255)
  archivedAt              DateTime?
  deletedAt               DateTime?

  createdById             Int
  createdBy               User     @relation("QuotationCreatedBy", fields: [createdById], references: [id])
  updatedById             Int?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  items                   QuotationItem[]
  revisions               QuotationRevision[]
  invoices                Invoice[]       @relation("InvoiceFromQuotation")

  @@index([customerId, documentDate])
  @@index([status, documentDate])
  @@index([financialYearId, status])
  @@map("quotations")
}

model QuotationItem {
  id                   BigInt   @id @default(autoincrement())
  quotationId          BigInt
  quotation            Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  lineNumber           Int
  sortOrder            Int      @default(0)
  itemId               Int?
  item                 Item?    @relation(fields: [itemId], references: [id])
  itemCode             String?  @db.VarChar(40)
  name                 String   @db.VarChar(200)
  description          String?  @db.Text
  hsnSacCode           String?  @db.VarChar(20)
  unitCode             String?  @db.VarChar(20)
  quantity             Decimal  @db.Decimal(18, 3)
  rate                 Decimal  @db.Decimal(18, 4)
  discountMode         DiscountMode @default(NONE)
  discountValue        Decimal  @default(0) @db.Decimal(18, 4)
  discountAmount       Decimal  @default(0) @db.Decimal(18, 4)
  lineGross            Decimal  @db.Decimal(18, 4)
  lineNet              Decimal  @db.Decimal(18, 4)
  allocatedDocDiscount Decimal  @default(0) @db.Decimal(18, 4)
  taxableAmount        Decimal  @db.Decimal(18, 4)
  taxAmount            Decimal  @db.Decimal(18, 4)
  lineTotal            Decimal  @db.Decimal(18, 4)
  taxGroupId           Int?
  isTaxExempt          Boolean  @default(false)
  exemptReason         String?  @db.VarChar(120)
  taxes                QuotationItemTax[]
  @@index([quotationId, sortOrder])
  @@map("quotation_items")
}

model QuotationItemTax {
  id            BigInt  @id @default(autoincrement())
  quotationItemId BigInt
  quotationItem QuotationItem @relation(fields: [quotationItemId], references: [id], onDelete: Cascade)
  taxRateId     Int
  taxRate       TaxRate @relation(fields: [taxRateId], references: [id])
  taxTypeKey    String  @db.VarChar(20)
  label         String  @db.VarChar(60)
  ratePercent   Decimal @db.Decimal(9, 4)
  taxableAmount Decimal @db.Decimal(18, 4)
  taxAmount     Decimal @db.Decimal(18, 4)
  @@index([quotationItemId])
  @@map("quotation_item_taxes")
}

model QuotationRevision {
  id               BigInt   @id @default(autoincrement())
  quotationId      BigInt
  quotation        Quotation @relation(fields: [quotationId], references: [id])
  version          Int
  changedById      Int
  changeReason     String?  @db.VarChar(500)
  previousDataJson Json
  newDataJson      Json
  diffSummaryJson  Json?
  createdAt        DateTime @default(now())
  @@unique([quotationId, version])
  @@map("quotation_revisions")
}

/* ────────────────────────── invoices ──────────────────────── */
/* Same shape as Quotation, with dueDate/paymentTerms instead of expiryDate,
   InvoiceStatus, and a link back to the source quotation.                   */

model Invoice {
  id                      BigInt   @id @default(autoincrement())
  number                  String   @unique @db.VarChar(60)
  financialYearId         Int
  financialYear           FinancialYear @relation(fields: [financialYearId], references: [id])
  quotationId             BigInt?
  sourceQuotation         Quotation? @relation("InvoiceFromQuotation", fields: [quotationId], references: [id])
  customerId              Int
  customer                Customer @relation(fields: [customerId], references: [id])
  customerSnapshot        Json
  billingAddressSnapshot  Json?
  shippingAddressSnapshot Json?
  companySnapshot         Json
  placeOfSupplyStateCode  String?  @db.VarChar(4)

  currencyCode            String   @db.Char(3)
  currency                Currency @relation(fields: [currencyCode], references: [code])
  currencySymbol          String   @db.VarChar(8)
  currencyDecimalPlaces   Int      @default(2)
  exchangeRateToBase      Decimal  @default(1) @db.Decimal(18, 8)
  baseCurrencyCode        String   @db.Char(3)
  baseTotal               Decimal  @db.Decimal(18, 4)

  documentDate            DateTime @db.Date
  dueDate                 DateTime? @db.Date
  paymentTermsDays        Int      @default(30)
  referenceNumber         String?  @db.VarChar(80)
  subject                 String?  @db.VarChar(255)
  status                  InvoiceStatus @default(DRAFT)

  discountMode            DiscountMode @default(NONE)
  discountValue           Decimal  @default(0) @db.Decimal(18, 4)
  subtotal                Decimal  @db.Decimal(18, 4)
  discountTotal           Decimal  @db.Decimal(18, 4)
  taxableTotal            Decimal  @db.Decimal(18, 4)
  taxTotal                Decimal  @db.Decimal(18, 4)
  adjustment              Decimal  @default(0) @db.Decimal(18, 4)
  roundOff                Decimal  @default(0) @db.Decimal(18, 4)
  grandTotal              Decimal  @db.Decimal(18, 4)
  amountPaid              Decimal  @default(0) @db.Decimal(18, 4)   // maintained from payments
  taxSummaryJson          Json

  notes                   String?  @db.Text
  terms                   String?  @db.Text
  customerMessage         String?  @db.Text
  paymentInstructions     String?  @db.Text
  bankAccountId           Int?
  showBankDetails         Boolean  @default(true)

  templateId              Int
  templateVersionId       Int
  templateVersion         TemplateVersion @relation(fields: [templateVersionId], references: [id])
  currentVersion          Int      @default(1)
  customFieldsJson        Json?

  issuedAt                DateTime?
  sentAt                  DateTime?
  firstViewedAt           DateTime?
  paidAt                  DateTime?
  cancelledAt             DateTime?
  voidedAt                DateTime?
  cancelReason            String?  @db.VarChar(255)
  archivedAt              DateTime?
  deletedAt               DateTime?

  createdById             Int
  createdBy               User     @relation("InvoiceCreatedBy", fields: [createdById], references: [id])
  updatedById             Int?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  items                   InvoiceItem[]
  revisions               InvoiceRevision[]
  payments                InvoicePayment[]

  @@index([customerId, documentDate])
  @@index([status, dueDate])
  @@index([financialYearId, status])
  @@map("invoices")
}

model InvoiceItem {
  id                   BigInt   @id @default(autoincrement())
  invoiceId            BigInt
  invoice              Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  lineNumber           Int
  sortOrder            Int      @default(0)
  itemId               Int?
  item                 Item?    @relation(fields: [itemId], references: [id])
  itemCode             String?  @db.VarChar(40)
  name                 String   @db.VarChar(200)
  description          String?  @db.Text
  hsnSacCode           String?  @db.VarChar(20)
  unitCode             String?  @db.VarChar(20)
  quantity             Decimal  @db.Decimal(18, 3)
  rate                 Decimal  @db.Decimal(18, 4)
  discountMode         DiscountMode @default(NONE)
  discountValue        Decimal  @default(0) @db.Decimal(18, 4)
  discountAmount       Decimal  @default(0) @db.Decimal(18, 4)
  lineGross            Decimal  @db.Decimal(18, 4)
  lineNet              Decimal  @db.Decimal(18, 4)
  allocatedDocDiscount Decimal  @default(0) @db.Decimal(18, 4)
  taxableAmount        Decimal  @db.Decimal(18, 4)
  taxAmount            Decimal  @db.Decimal(18, 4)
  lineTotal            Decimal  @db.Decimal(18, 4)
  taxGroupId           Int?
  isTaxExempt          Boolean  @default(false)
  exemptReason         String?  @db.VarChar(120)
  taxes                InvoiceItemTax[]
  @@index([invoiceId, sortOrder])
  @@map("invoice_items")
}

model InvoiceItemTax {
  id            BigInt  @id @default(autoincrement())
  invoiceItemId BigInt
  invoiceItem   InvoiceItem @relation(fields: [invoiceItemId], references: [id], onDelete: Cascade)
  taxRateId     Int
  taxRate       TaxRate @relation(fields: [taxRateId], references: [id])
  taxTypeKey    String  @db.VarChar(20)
  label         String  @db.VarChar(60)
  ratePercent   Decimal @db.Decimal(9, 4)
  taxableAmount Decimal @db.Decimal(18, 4)
  taxAmount     Decimal @db.Decimal(18, 4)
  @@index([invoiceItemId])
  @@map("invoice_item_taxes")
}

model InvoiceRevision {
  id               BigInt   @id @default(autoincrement())
  invoiceId        BigInt
  invoice          Invoice  @relation(fields: [invoiceId], references: [id])
  version          Int
  changedById      Int
  changeReason     String?  @db.VarChar(500)
  previousDataJson Json
  newDataJson      Json
  diffSummaryJson  Json?
  createdAt        DateTime @default(now())
  @@unique([invoiceId, version])
  @@map("invoice_revisions")
}

model InvoicePayment {                 // flag-gated: FEATURE_MANUAL_PAYMENTS (pending approval)
  id                 BigInt   @id @default(autoincrement())
  invoiceId          BigInt
  invoice            Invoice  @relation(fields: [invoiceId], references: [id])
  paymentDate        DateTime @db.Date
  amount             Decimal  @db.Decimal(18, 4)
  currencyCode       String   @db.Char(3)
  exchangeRateToBase Decimal  @default(1) @db.Decimal(18, 8)
  method             PaymentMethod @default(BANK_TRANSFER)
  reference          String?  @db.VarChar(120)
  notes              String?  @db.Text
  recordedById       Int
  createdAt          DateTime @default(now())
  @@index([invoiceId, paymentDate])
  @@map("invoice_payments")
}

/* ───────────────── files, sharing, email, audit ───────────── */

model DocumentFile {
  id                BigInt   @id @default(autoincrement())
  entityType        EntityType
  entityId          BigInt?
  kind              FileKind
  documentVersion   Int?                          // which revision this PDF represents
  templateVersionId Int?
  storageKey        String   @db.VarChar(500)
  fileName          String   @db.VarChar(255)
  mimeType          String   @db.VarChar(120)
  sizeBytes         Int
  checksumSha256    String?  @db.Char(64)
  createdById       Int?
  createdAt         DateTime @default(now())
  @@index([entityType, entityId, kind])
  @@map("document_files")
}

model DocumentShare {
  id           BigInt   @id @default(autoincrement())
  entityType   EntityType
  entityId     BigInt
  tokenHash    String   @unique @db.VarChar(255)
  channel      ShareChannel @default(LINK)
  expiresAt    DateTime?
  revokedAt    DateTime?
  viewCount    Int      @default(0)
  lastViewedAt DateTime?
  createdById  Int
  createdAt    DateTime @default(now())
  @@index([entityType, entityId])
  @@map("document_shares")
}

model EmailMessage {
  id                BigInt   @id @default(autoincrement())
  entityType        EntityType
  entityId          BigInt?
  toJson            Json
  ccJson            Json?
  subject           String   @db.VarChar(255)
  body              String   @db.Text
  attachmentFileIds Json?
  status            EmailStatus @default(QUEUED)
  providerMessageId String?  @db.VarChar(190)
  error             String?  @db.Text
  sentById          Int?
  sentAt            DateTime?
  createdAt         DateTime @default(now())
  @@index([entityType, entityId])
  @@map("email_messages")
}

model AuditLog {
  id                BigInt   @id @default(autoincrement())
  userId            Int?
  user              User?    @relation(fields: [userId], references: [id])
  userEmailSnapshot String?  @db.VarChar(190)
  action            AuditAction
  entityType        EntityType
  entityId          BigInt?
  entityLabel       String?  @db.VarChar(190)
  ip                String?  @db.VarChar(64)
  userAgent         String?  @db.VarChar(255)
  requestId         String?  @db.VarChar(40)
  previousDataJson  Json?
  newDataJson       Json?
  metadataJson      Json?
  createdAt         DateTime @default(now())
  @@index([entityType, entityId, createdAt])
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

## Seed plan (`prisma/seed.ts`)

1. **Permissions** — the full catalogue from `06-auth-rbac-audit-revision.md` §3.
2. **Roles** — `SUPER_ADMIN` (all), `ADMIN` (operational set), `FINANCE_VIEWER` (read/export only).
3. **Users** — one per role, credentials read **only** from `SEED_*` env vars; the seed aborts with a
   clear message if they are absent and never prints a password. Seeded users get
   `mustChangePassword = true`.
4. **Currencies** — INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, CHF (JPY `decimalPlaces = 0`,
   INR `separatorStyle = INDIAN`).
5. **Tax types & rates** — CGST/SGST/IGST at 2.5/6/9/14 and 5/12/18/28, UTGST, EXEMPT, ZERO_RATED,
   NON_GST; tax groups "GST 5/12/18/28% (Intra)" and "(Inter)".
6. **Units** — NOS, HRS, DAY, MONTH, YEAR, LOT, LICENSE, USER, GB, PROJECT.
7. **Numbering series** — `QT-{FY_START}-{SEQ}` and `INV-{FY_START}-{SEQ}`, padding 4.
8. **Financial years** — current FY plus the previous one.
9. **Company settings** — placeholder single row, flagged incomplete until an admin fills it in.
10. **Templates** — Corporate/Modern/Classic × Invoice/Quotation, each with a published v1 config.
11. **Demo data** (dev only, `--demo` flag) — 5 customers, 10 items, 3 quotations, 2 invoices.
