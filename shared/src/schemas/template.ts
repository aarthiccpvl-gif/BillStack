import { z } from 'zod';

/**
 * Template configuration.
 *
 * This is the entirety of what "customise a template" means. It is a closed,
 * validated shape rather than free-form HTML/CSS: user-authored markup in a
 * document renderer is a security and maintenance hazard, and a fixed schema is
 * what lets a stored config from 2026 still render correctly years later.
 */

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #1B5E40');

/**
 * Font stacks rather than arbitrary names.
 *
 * `sans`, `serif` and `narrow` map to faces present on both a Windows developer
 * machine and the Linux container (via fonts-liberation / fonts-dejavu), so a
 * document does not reflow depending on where the PDF was produced. `poppins`
 * is the application's own face and is not installed anywhere: the renderer
 * embeds it in the stylesheet (see backend/src/render/fonts.ts), which buys the
 * same guarantee at the cost of ~21 KB per document.
 */
export const FONT_FAMILIES = {
  POPPINS: 'poppins',
  SANS: 'sans',
  SERIF: 'serif',
  NARROW: 'narrow',
} as const;

export type FontFamilyKey = (typeof FONT_FAMILIES)[keyof typeof FONT_FAMILIES];

export const FONT_STACKS: Record<FontFamilyKey, string> = {
  poppins: "'Poppins', 'Liberation Sans', Arial, Helvetica, sans-serif",
  sans: "'Liberation Sans', Arial, Helvetica, 'DejaVu Sans', sans-serif",
  serif: "'Liberation Serif', 'Times New Roman', Times, 'DejaVu Serif', serif",
  narrow: "'Liberation Sans Narrow', 'Arial Narrow', 'Liberation Sans', Arial, sans-serif",
};

export const FONT_LABELS: Record<FontFamilyKey, string> = {
  poppins: 'Poppins',
  sans: 'Sans serif',
  serif: 'Serif',
  narrow: 'Narrow sans',
};

export const ITEM_COLUMN_KEYS = [
  'sno',
  'item',
  'description',
  'hsn',
  'unit',
  'qty',
  'rate',
  'discount',
  'tax',
  'amount',
] as const;

export type ItemColumnKey = (typeof ITEM_COLUMN_KEYS)[number];

export const ITEM_COLUMN_LABELS: Record<ItemColumnKey, string> = {
  sno: '#',
  item: 'Item',
  description: 'Description',
  hsn: 'HSN/SAC',
  unit: 'Unit',
  qty: 'Qty',
  rate: 'Rate',
  discount: 'Discount',
  tax: 'Tax',
  amount: 'Amount',
};

const itemColumnSchema = z.object({
  key: z.enum(ITEM_COLUMN_KEYS),
  show: z.boolean(),
  label: z.string().trim().min(1).max(30),
  /** Percentage of the table width. Visible columns must total 100. */
  widthPct: z.number().min(2).max(60),
  align: z.enum(['left', 'right', 'center']).default('left'),
});

export const templateConfigSchema = z
  .object({
    branding: z.object({
      logo: z.object({
        show: z.boolean().default(true),
        position: z.enum(['LEFT', 'CENTER', 'RIGHT']).default('LEFT'),
        widthMm: z.number().min(15).max(80).default(38),
      }),
      colors: z.object({
        primary: hexColor.default('#1B5E40'),
        secondary: hexColor.default('#6B7770'),
        text: hexColor.default('#131C17'),
        muted: hexColor.default('#6B7770'),
        border: hexColor.default('#D8DED6'),
        tableHeaderBg: hexColor.default('#EDF3E7'),
        tableHeaderText: hexColor.default('#131C17'),
      }),
      /** Authorised signature image (decision Q13). */
      signature: z.object({
        show: z.boolean().default(true),
        widthMm: z.number().min(15).max(70).default(38),
        label: z.string().trim().max(120).default('Authorised Signatory'),
      }),
      /** Company seal / stamp — its own upload and its own area (decision Q13). */
      seal: z.object({
        show: z.boolean().default(true),
        widthMm: z.number().min(15).max(70).default(30),
        position: z.enum(['BESIDE_SIGNATURE', 'ABOVE_SIGNATURE']).default('BESIDE_SIGNATURE'),
      }),
    }),

    typography: z.object({
      fontFamily: z
        .enum([
          FONT_FAMILIES.POPPINS,
          FONT_FAMILIES.SANS,
          FONT_FAMILIES.SERIF,
          FONT_FAMILIES.NARROW,
        ])
        .default('poppins'),
      baseSizePt: z.number().min(7).max(12).default(9),
      headingSizePt: z.number().min(12).max(28).default(19),
      tableSizePt: z.number().min(6).max(11).default(8.5),
      lineHeight: z.number().min(1.1).max(1.8).default(1.4),
    }),

    layout: z.object({
      pageSize: z.literal('A4').default('A4'),
      marginsMm: z.object({
        top: z.number().min(5).max(40).default(14),
        right: z.number().min(5).max(40).default(14),
        bottom: z.number().min(8).max(40).default(16),
        left: z.number().min(5).max(40).default(14),
      }),
      /** "TAX INVOICE", "QUOTATION", "ESTIMATE" … */
      documentTitle: z.string().trim().min(1).max(40).default('INVOICE'),
      headerStyle: z.enum(['BANNER', 'MINIMAL', 'SPLIT']).default('BANNER'),
      showHeaderOnAllPages: z.boolean().default(false),
      tableStyle: z.enum(['BORDERED', 'STRIPED', 'MINIMAL']).default('BORDERED'),
      sectionSpacingMm: z.number().min(2).max(14).default(6),
      footer: z.object({
        text: z.string().trim().max(200).default(''),
        showPageNumbers: z.boolean().default(true),
        showGeneratedAt: z.boolean().default(false),
      }),
      itemColumns: z.array(itemColumnSchema).min(2).max(ITEM_COLUMN_KEYS.length),
    }),

    /** PRD §26 visibility switches. */
    sections: z.object({
      billingAddress: z.boolean().default(true),
      shippingAddress: z.boolean().default(false),
      gstDetails: z.boolean().default(true),
      taxSummary: z.boolean().default(true),
      hsnSummary: z.boolean().default(false),
      bankDetails: z.boolean().default(true),
      paymentInstructions: z.boolean().default(true),
      notes: z.boolean().default(true),
      terms: z.boolean().default(true),
      customerMessage: z.boolean().default(false),
      customFields: z.boolean().default(false),
      amountInWords: z.boolean().default(true),
      signature: z.boolean().default(true),
      seal: z.boolean().default(true),
      declaration: z.boolean().default(false),
    }),

    content: z.object({
      declarationText: z.string().trim().max(600).default(''),
      footerNote: z.string().trim().max(300).default(''),
      thankYouNote: z.string().trim().max(200).default(''),
    }),

    locale: z.object({
      dateFormat: z.enum(['dd-MMM-yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']).default('dd-MMM-yyyy'),
    }),
  })
  .superRefine((config, ctx) => {
    const visible = config.layout.itemColumns.filter((column) => column.show);

    if (visible.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout', 'itemColumns'],
        message: 'At least one item column must be visible.',
      });
      return;
    }

    /* Widths are percentages of the table, so they have to add up — otherwise the
       items table silently overflows or leaves a gap. */
    const total = visible.reduce((sum, column) => sum + column.widthPct, 0);
    if (Math.abs(total - 100) > 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout', 'itemColumns'],
        message: `Visible column widths must total 100% — they currently total ${total.toFixed(1)}%.`,
      });
    }

    const keys = config.layout.itemColumns.map((column) => column.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout', 'itemColumns'],
        message: 'Each item column may appear only once.',
      });
    }
  });

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/** Sensible starting columns: description-led, with tax and amount on the right. */
export const defaultItemColumns = (): TemplateConfig['layout']['itemColumns'] => [
  { key: 'sno', show: true, label: '#', widthPct: 5, align: 'left' },
  { key: 'item', show: true, label: 'Item & Description', widthPct: 37, align: 'left' },
  { key: 'description', show: false, label: 'Description', widthPct: 20, align: 'left' },
  { key: 'hsn', show: true, label: 'HSN/SAC', widthPct: 10, align: 'left' },
  { key: 'unit', show: false, label: 'Unit', widthPct: 7, align: 'center' },
  { key: 'qty', show: true, label: 'Qty', widthPct: 8, align: 'right' },
  { key: 'rate', show: true, label: 'Rate', widthPct: 13, align: 'right' },
  { key: 'discount', show: false, label: 'Discount', widthPct: 10, align: 'right' },
  { key: 'tax', show: true, label: 'Tax', widthPct: 12, align: 'right' },
  { key: 'amount', show: true, label: 'Amount', widthPct: 15, align: 'right' },
];

/** A complete, valid config — the base every seeded template starts from. */
export const defaultTemplateConfig = (documentTitle = 'INVOICE'): TemplateConfig =>
  templateConfigSchema.parse({
    branding: {
      logo: { show: true, position: 'LEFT', widthMm: 38 },
      colors: {},
      signature: { show: true, widthMm: 38, label: 'Authorised Signatory' },
      seal: { show: true, widthMm: 30, position: 'BESIDE_SIGNATURE' },
    },
    typography: {},
    layout: {
      marginsMm: {},
      documentTitle,
      footer: {},
      itemColumns: defaultItemColumns(),
    },
    sections: {},
    content: {},
    locale: {},
  });

/** Validates a stored config, falling back to defaults if it predates a change. */
export const parseTemplateConfig = (value: unknown, documentTitle = 'INVOICE'): TemplateConfig => {
  const result = templateConfigSchema.safeParse(value);
  return result.success ? result.data : defaultTemplateConfig(documentTitle);
};
