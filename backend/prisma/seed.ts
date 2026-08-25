/* eslint-disable no-console */
/**
 * Database seed.
 *
 * Idempotent: every write is an upsert, so it is safe to re-run after a schema
 * change or on an existing environment.
 *
 * Credentials come only from SEED_* environment variables. The seed aborts with a
 * clear message rather than inventing a password, never prints one, and marks every
 * seeded account `mustChangePassword` so the first sign-in forces a new one.
 *
 *   npm run db:seed -w backend
 */
import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_KEYS,
  ROLE_LABELS,
  formatFinancialYearCode,
  getFinancialYearBounds,
  splitPermission,
  type Permission,
  type RoleKey,
} from '@app/shared';
import { defaultTemplateConfig } from '@app/shared';
import { hashPassword } from '../src/modules/auth/password.service';

const prisma = new PrismaClient();

// --------------------------------------------------------------- helpers ---

const log = (message: string) => console.log(`  ${message}`);
const section = (message: string) => console.log(`\n▸ ${message}`);

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `${key} is not set.\n` +
        '    Seed users are never hard-coded. Set the SEED_* variables in .env first:\n' +
        '      SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD\n' +
        '      SEED_ADMIN_EMAIL       / SEED_ADMIN_PASSWORD\n' +
        '      SEED_FINANCE_EMAIL     / SEED_FINANCE_PASSWORD',
    );
  }
  return value.trim();
};

// ----------------------------------------------------------- permissions ---

const seedPermissions = async () => {
  section('Permissions');
  for (const key of ALL_PERMISSIONS) {
    const { module, action } = splitPermission(key);
    await prisma.permission.upsert({
      where: { key },
      update: { module, action },
      create: { key, module, action },
    });
  }
  log(`${ALL_PERMISSIONS.length} permissions`);
};

// ----------------------------------------------------------------- roles ---

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Full access, including templates, company settings, master data and users.',
  ADMIN: 'Creates and manages customers, items, quotations and invoices.',
  FINANCE_VIEWER: 'Read-only. Can view, report, export and download; can change nothing.',
};

const seedRoles = async () => {
  section('Roles');
  for (const key of Object.values(ROLE_KEYS)) {
    const permissionKeys: Permission[] = ROLE_PERMISSIONS[key] ?? [];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { id: true },
    });

    const role = await prisma.role.upsert({
      where: { key },
      update: {
        name: ROLE_LABELS[key],
        description: ROLE_DESCRIPTIONS[key],
        isReadOnly: key === ROLE_KEYS.FINANCE_VIEWER,
      },
      create: {
        key,
        name: ROLE_LABELS[key],
        description: ROLE_DESCRIPTIONS[key],
        isSystem: true,
        isReadOnly: key === ROLE_KEYS.FINANCE_VIEWER,
      },
    });

    // Reassert the seed matrix so a schema change cannot leave a role short.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });

    log(`${ROLE_LABELS[key]} — ${permissions.length} permissions`);
  }
};

// ----------------------------------------------------------------- users ---

const seedUsers = async () => {
  section('Users');

  const definitions = [
    {
      roleKey: ROLE_KEYS.SUPER_ADMIN,
      name: 'Super Admin',
      email: requireEnv('SEED_SUPER_ADMIN_EMAIL'),
      password: requireEnv('SEED_SUPER_ADMIN_PASSWORD'),
    },
    {
      roleKey: ROLE_KEYS.ADMIN,
      name: 'Billing Admin',
      email: requireEnv('SEED_ADMIN_EMAIL'),
      password: requireEnv('SEED_ADMIN_PASSWORD'),
    },
    {
      roleKey: ROLE_KEYS.FINANCE_VIEWER,
      name: 'Finance Viewer',
      email: requireEnv('SEED_FINANCE_EMAIL'),
      password: requireEnv('SEED_FINANCE_PASSWORD'),
    },
  ];

  for (const definition of definitions) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: definition.roleKey } });
    const email = definition.email.toLowerCase();
    const passwordHash = await hashPassword(definition.password);

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      // Never silently reset a password that someone has already changed.
      await prisma.user.update({
        where: { email },
        data: { roleId: role.id, status: 'ACTIVE' },
      });
      log(`${email} — already present, role reasserted (password untouched)`);
      continue;
    }

    await prisma.user.create({
      data: {
        name: definition.name,
        email,
        passwordHash,
        roleId: role.id,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    });
    log(`${email} — created as ${ROLE_LABELS[definition.roleKey]} (must change password)`);
  }
};

// ------------------------------------------------------------ currencies ---

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, separatorStyle: 'INDIAN' },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, separatorStyle: 'WESTERN' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, separatorStyle: 'WESTERN' },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2, separatorStyle: 'WESTERN' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2, separatorStyle: 'WESTERN' },
  {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    decimalPlaces: 2,
    separatorStyle: 'WESTERN',
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    decimalPlaces: 2,
    separatorStyle: 'WESTERN',
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'C$',
    decimalPlaces: 2,
    separatorStyle: 'WESTERN',
  },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, separatorStyle: 'WESTERN' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2, separatorStyle: 'WESTERN' },
] as const;

const seedCurrencies = async () => {
  section('Currencies');
  for (const [index, currency] of CURRENCIES.entries()) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        separatorStyle: currency.separatorStyle,
        sortOrder: index,
      },
      create: {
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        separatorStyle: currency.separatorStyle,
        symbolPosition: 'PREFIX',
        sortOrder: index,
      },
    });
  }
  log(`${CURRENCIES.length} currencies (JPY seeded with 0 decimal places, INR with lakh grouping)`);
};

// ------------------------------------------------------------------ tax ----

const TAX_TYPES = [
  { key: 'CGST', name: 'Central GST', scope: 'INTRA_STATE' },
  { key: 'SGST', name: 'State GST', scope: 'INTRA_STATE' },
  { key: 'IGST', name: 'Integrated GST', scope: 'INTER_STATE' },
  { key: 'UTGST', name: 'Union Territory GST', scope: 'UNION_TERRITORY' },
  { key: 'EXEMPT', name: 'Exempt', scope: 'NONE' },
  { key: 'ZERO_RATED', name: 'Zero Rated', scope: 'NONE' },
  { key: 'NON_GST', name: 'Non-GST', scope: 'NONE' },
] as const;

/** The GST slabs, and the component rate each slab needs per tax type. */
const GST_SLABS = [5, 12, 18, 28] as const;

const seedTaxes = async () => {
  section('Tax types, rates and groups');

  for (const [index, type] of TAX_TYPES.entries()) {
    await prisma.taxType.upsert({
      where: { key: type.key },
      update: { name: type.name, scope: type.scope, sortOrder: index },
      create: { key: type.key, name: type.name, scope: type.scope, sortOrder: index },
    });
  }
  log(`${TAX_TYPES.length} tax types`);

  const typeByKey = new Map(
    (await prisma.taxType.findMany()).map((type) => [type.key, type] as const),
  );

  /** Upserts a rate by its (type, percentage) pair, which is what makes it unique. */
  const upsertRate = async (typeKey: string, percent: number) => {
    const taxType = typeByKey.get(typeKey);
    if (!taxType) throw new Error(`Tax type ${typeKey} missing`);
    const name = `${typeKey} ${percent}%`;

    const existing = await prisma.taxRate.findFirst({ where: { taxTypeId: taxType.id, name } });
    if (existing) {
      return prisma.taxRate.update({ where: { id: existing.id }, data: { rate: percent } });
    }
    return prisma.taxRate.create({ data: { taxTypeId: taxType.id, name, rate: percent } });
  };

  let rateCount = 0;
  for (const slab of GST_SLABS) {
    const half = slab / 2;
    const cgst = await upsertRate('CGST', half);
    const sgst = await upsertRate('SGST', half);
    const utgst = await upsertRate('UTGST', half);
    const igst = await upsertRate('IGST', slab);
    rateCount += 4;

    /* A user picks one group; the engine expands it into the line's components. */
    const groups = [
      { name: `GST ${slab}% (Intra-state)`, scope: 'INTRA_STATE' as const, rates: [cgst, sgst] },
      { name: `GST ${slab}% (Inter-state)`, scope: 'INTER_STATE' as const, rates: [igst] },
      {
        name: `GST ${slab}% (Union Territory)`,
        scope: 'UNION_TERRITORY' as const,
        rates: [cgst, utgst],
      },
    ];

    for (const [index, definition] of groups.entries()) {
      const group = await prisma.taxGroup.upsert({
        where: { name: definition.name },
        update: { scope: definition.scope, totalRate: slab },
        create: {
          name: definition.name,
          scope: definition.scope,
          totalRate: slab,
          sortOrder: slab * 10 + index,
        },
      });
      await prisma.taxGroupRate.deleteMany({ where: { taxGroupId: group.id } });
      await prisma.taxGroupRate.createMany({
        data: definition.rates.map((rate) => ({ taxGroupId: group.id, taxRateId: rate.id })),
      });
    }
  }

  for (const zeroKey of ['EXEMPT', 'ZERO_RATED', 'NON_GST']) {
    const rate = await upsertRate(zeroKey, 0);
    rateCount += 1;
    const name =
      zeroKey === 'EXEMPT' ? 'Exempt' : zeroKey === 'ZERO_RATED' ? 'Zero Rated' : 'Non-GST';
    const group = await prisma.taxGroup.upsert({
      where: { name },
      update: { scope: 'NONE', totalRate: 0 },
      create: { name, scope: 'NONE', totalRate: 0, sortOrder: 900 },
    });
    await prisma.taxGroupRate.deleteMany({ where: { taxGroupId: group.id } });
    await prisma.taxGroupRate.create({ data: { taxGroupId: group.id, taxRateId: rate.id } });
  }

  log(`${rateCount} tax rates, ${GST_SLABS.length * 3 + 3} tax groups`);
};

// ---------------------------------------------------------------- units ----

const UNITS = [
  { code: 'NOS', name: 'Numbers' },
  { code: 'HRS', name: 'Hours' },
  { code: 'DAY', name: 'Days' },
  { code: 'MTH', name: 'Months' },
  { code: 'YR', name: 'Years' },
  { code: 'LOT', name: 'Lot' },
  { code: 'LIC', name: 'Licence' },
  { code: 'USR', name: 'Users' },
  { code: 'GB', name: 'Gigabytes' },
  { code: 'PRJ', name: 'Project' },
] as const;

const ITEM_CATEGORIES = [
  'Software Development',
  'Cloud & Hosting',
  'Support & Maintenance',
  'Licences',
  'Hardware',
  'Consulting',
];

const seedUnitsAndCategories = async () => {
  section('Units and item categories');
  for (const unit of UNITS) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: { name: unit.name },
      create: { code: unit.code, name: unit.name },
    });
  }
  for (const name of ITEM_CATEGORIES) {
    await prisma.itemCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  log(`${UNITS.length} units, ${ITEM_CATEGORIES.length} categories`);
};

// ------------------------------------------------- financial years & numbering --

const seedFinancialYears = async (startMonth: number) => {
  section('Financial years');
  const today = new Date();
  const todayString = today.toISOString().slice(0, 10);
  const current = getFinancialYearBounds(todayString, startMonth);
  const previous = getFinancialYearBounds(
    `${current.startYear - 1}-${String(startMonth).padStart(2, '0')}-01`,
    startMonth,
  );

  for (const bounds of [previous, current]) {
    await prisma.financialYear.upsert({
      where: { code: bounds.code },
      update: {
        startDate: new Date(`${bounds.startDate}T00:00:00.000Z`),
        endDate: new Date(`${bounds.endDate}T00:00:00.000Z`),
        isCurrent: bounds.code === current.code,
      },
      create: {
        code: bounds.code,
        startDate: new Date(`${bounds.startDate}T00:00:00.000Z`),
        endDate: new Date(`${bounds.endDate}T00:00:00.000Z`),
        isCurrent: bounds.code === current.code,
      },
    });
  }

  // Exactly one year may be current.
  await prisma.financialYear.updateMany({
    where: { code: { not: current.code } },
    data: { isCurrent: false },
  });

  log(`${previous.code}, ${current.code} (current)`);
  return current;
};

/**
 * Decision Q1: FT001/2026-2027. The quotation series uses the same shape with a QT
 * prefix so the two can never be confused; both are editable in the UI.
 */
const NUMBERING = [
  { docType: 'INVOICE' as const, prefix: 'FT', pattern: '{PREFIX}{SEQ}/{FY_LONG}', padding: 3 },
  { docType: 'QUOTATION' as const, prefix: 'QT', pattern: '{PREFIX}{SEQ}/{FY_LONG}', padding: 3 },
];

const seedNumbering = async () => {
  section('Document numbering');
  for (const series of NUMBERING) {
    const existing = await prisma.numberingSeries.findFirst({
      where: { docType: series.docType, isActive: true },
    });
    if (existing) {
      log(`${series.docType} — already configured (${existing.prefix}, left as is)`);
      continue;
    }
    await prisma.numberingSeries.create({
      data: {
        docType: series.docType,
        prefix: series.prefix,
        pattern: series.pattern,
        padding: series.padding,
        startNumber: 1,
        resetPolicy: 'FINANCIAL_YEAR',
      },
    });
    log(`${series.docType} — ${series.prefix}001/${new Date().getFullYear()}-…`);
  }
};

// -------------------------------------------------------------- company ----

const seedCompany = async () => {
  section('Company settings');
  await prisma.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: 'Your Company',
      country: 'India',
      baseCurrencyCode: 'INR',
      financialYearStartMonth: 4,
      isConfigured: false,
    },
  });
  log('placeholder row created (isConfigured = false until an admin fills it in)');
};

const APP_SETTINGS: { key: string; valueJson: unknown; description: string }[] = [
  {
    key: 'finance.roundOffEnabled',
    valueJson: true,
    description: 'Round the grand total to the nearest whole unit and show the difference.',
  },
  {
    key: 'finance.discountBeforeTax',
    valueJson: true,
    description: 'Document discount reduces taxable value (decision Q5).',
  },
  {
    key: 'sharing.linkTtlDays',
    valueJson: 30,
    description: 'Default lifetime of a secure document share link (decision Q9).',
  },
  {
    key: 'documents.numberOnFirstSave',
    valueJson: true,
    description: 'Assign the document number when the draft is first saved (decision Q7).',
  },
];

const seedAppSettings = async () => {
  section('Application settings');
  for (const setting of APP_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { description: setting.description },
      create: {
        key: setting.key,
        valueJson: setting.valueJson as object,
        description: setting.description,
      },
    });
  }
  log(`${APP_SETTINGS.length} settings`);
};

// ------------------------------------------------------------- templates ---

/**
 * Three layouts for each document type, each with a published v1.
 *
 * Corporate is the default for both: it is the densest and the most conventional
 * for an Indian tax invoice.
 */
const TEMPLATES = [
  {
    key: 'corporate',
    name: 'Corporate',
    engineKey: 'corporate',
    isDefault: true,
    description: 'Colour banner, logo left, metadata panel right. Dense and formal.',
  },
  {
    key: 'modern',
    name: 'Modern',
    engineKey: 'modern',
    isDefault: false,
    description: 'No banner. Large title, accent rule and generous whitespace.',
  },
  {
    key: 'classic',
    name: 'Classic',
    engineKey: 'classic',
    isDefault: false,
    description: 'Traditional ruled frame with a centred masthead.',
  },
] as const;

const seedTemplates = async () => {
  section('Document templates');

  for (const docType of ['INVOICE', 'QUOTATION'] as const) {
    const title = docType === 'INVOICE' ? 'TAX INVOICE' : 'QUOTATION';

    for (const definition of TEMPLATES) {
      const existing = await prisma.template.findUnique({
        where: { key_docType: { key: definition.key, docType } },
        include: { versions: true },
      });

      if (existing) {
        log(`${definition.name} (${docType}) — already present, left as is`);
        continue;
      }

      const config = defaultTemplateConfig(title);

      /* Each layout gets defaults that suit it rather than one identical config. */
      if (definition.engineKey === 'modern') {
        config.layout.tableStyle = 'MINIMAL';
        config.typography.headingSizePt = 22;
        config.layout.sectionSpacingMm = 8;
      }
      if (definition.engineKey === 'classic') {
        config.typography.fontFamily = 'serif';
        config.layout.tableStyle = 'BORDERED';
        config.branding.logo.widthMm = 30;
      }
      if (docType === 'QUOTATION') {
        config.sections.bankDetails = false;
        config.sections.paymentInstructions = false;
        config.content.thankYouNote = 'Thank you for the opportunity to quote.';
      }

      await prisma.template.create({
        data: {
          key: definition.key,
          name: definition.name,
          docType,
          engineKey: definition.engineKey,
          description: definition.description,
          isDefault: definition.isDefault,
          versions: {
            create: {
              version: 1,
              configJson: config as unknown as object,
              status: 'PUBLISHED',
              publishedAt: new Date(),
              changeNote: 'Seeded default',
            },
          },
        },
      });

      log(`${definition.name} (${docType}) — created with a published v1`);
    }
  }

  /* Point company settings at the defaults. */
  const defaults = await prisma.template.findMany({ where: { isDefault: true } });
  const invoiceDefault = defaults.find((entry) => entry.docType === 'INVOICE');
  const quotationDefault = defaults.find((entry) => entry.docType === 'QUOTATION');

  await prisma.companySettings.update({
    where: { id: 1 },
    data: {
      defaultInvoiceTemplateId: invoiceDefault?.id ?? null,
      defaultQuotationTemplateId: quotationDefault?.id ?? null,
    },
  });
};

// ------------------------------------------------------------------ main ---

const main = async () => {
  console.log('\nSeeding the invoice database…');

  await seedPermissions();
  await seedRoles();
  await seedUsers();
  await seedCurrencies();
  await seedTaxes();
  await seedUnitsAndCategories();
  await seedCompany();
  const currentFy = await seedFinancialYears(4);
  await seedNumbering();
  await seedAppSettings();
  await seedTemplates();

  console.log(
    `\nDone. Current financial year ${formatFinancialYearCode(currentFy.startYear)}.` +
      '\nSeeded users must set a new password at first sign-in.\n',
  );
};

main()
  .catch((error: unknown) => {
    console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
