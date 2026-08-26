import { FONT_STACKS, type TemplateConfig } from '@app/shared';

import { fontFaceCss } from './fonts';

/**
 * Template config → print CSS.
 *
 * Everything configurable becomes a CSS custom property, so the layouts read
 * `var(--primary)` and never branch on the config themselves. The stylesheet is
 * emitted inline: the rendered HTML must make no network requests at all, which
 * is what makes the PDF deterministic and the renderer usable offline.
 */

const mm = (value: number): string => `${value}mm`;
const pt = (value: number): string => `${value}pt`;

export const themeVariables = (config: TemplateConfig): string => {
  const { colors, logo, signature, seal } = config.branding;
  const { typography, layout } = config;

  return `
    --primary: ${colors.primary};
    --secondary: ${colors.secondary};
    --text: ${colors.text};
    --muted: ${colors.muted};
    --border: ${colors.border};
    --table-header-bg: ${colors.tableHeaderBg};
    --table-header-text: ${colors.tableHeaderText};

    --font-family: ${FONT_STACKS[typography.fontFamily]};
    --font-size: ${pt(typography.baseSizePt)};
    --heading-size: ${pt(typography.headingSizePt)};
    --table-size: ${pt(typography.tableSizePt)};
    --line-height: ${typography.lineHeight};

    --margin-top: ${mm(layout.marginsMm.top)};
    --margin-right: ${mm(layout.marginsMm.right)};
    --margin-bottom: ${mm(layout.marginsMm.bottom)};
    --margin-left: ${mm(layout.marginsMm.left)};
    --section-gap: ${mm(layout.sectionSpacingMm)};

    --logo-width: ${mm(logo.widthMm)};
    --signature-width: ${mm(signature.widthMm)};
    --seal-width: ${mm(seal.widthMm)};
  `.trim();
};

/**
 * The print rules that make a multi-page document behave.
 *
 * These live here rather than in each layout because they are correctness, not
 * style: a repeated table header and an unbroken totals block are requirements,
 * not preferences.
 */
const BASE_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  /* Margins are applied in-flow rather than by @page, so the running header and
     footer Chromium draws do not collide with the content box. */
  @page { size: A4; margin: 0; }

  html, body { margin: 0; padding: 0; }

  body {
    font-family: var(--font-family);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: var(--text);
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    padding: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
  }

  h1, h2, h3, p, table { margin: 0; }
  table { border-collapse: collapse; width: 100%; }

  /* Label/value pairs: the gutter belongs to the label column, not to one row. */
  table.kv td:first-child { padding-right: 4mm; }

  /* <address> is italic by default in every browser, which reads as an error on a
     printed invoice. */
  address { font-style: normal; line-height: 1.45; }

  .section { margin-top: var(--section-gap); }

  .label {
    font-size: 0.82em;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .muted { color: var(--muted); }
  .strong { font-weight: 700; }

  /* Every column of figures lines up, which is the whole point of a money table. */
  .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .doc-title {
    font-size: var(--heading-size);
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.1;
  }

  /* --- items table ------------------------------------------------------- */

  .items { font-size: var(--table-size); }
  .items th, .items td { padding: 1.6mm 2mm; vertical-align: top; }
  .items thead th {
    background: var(--table-header-bg);
    color: var(--table-header-text);
    font-weight: 700;
    text-align: left;
    border-bottom: 0.4mm solid var(--primary);
  }
  .items th.num, .items td.num { text-align: right; }
  .items th.center, .items td.center { text-align: center; }

  .items--BORDERED th, .items--BORDERED td { border: 0.2mm solid var(--border); }
  .items--STRIPED tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--border) 35%, #fff); }
  .items--STRIPED td { border-bottom: 0.2mm solid var(--border); }
  .items--MINIMAL td { border-bottom: 0.2mm solid var(--border); }

  .item-name { font-weight: 600; }
  .item-desc { color: var(--muted); font-size: 0.94em; white-space: pre-line; }

  /* --- pagination correctness -------------------------------------------- */

  /* Repeat the item-table header on every page. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  /* Never split a line, a block, or the totals across a page boundary. */
  tr, .block, .totals, .signature-area, .summary-row { break-inside: avoid; page-break-inside: avoid; }

  /* The totals must never be orphaned from the table they total. */
  .totals { break-before: avoid; page-break-before: avoid; }

  .page-break { break-after: page; page-break-after: always; }

  /* --- totals ------------------------------------------------------------ */

  .totals { margin-top: var(--section-gap); display: flex; justify-content: flex-end; }
  .totals table { width: 42%; min-width: 70mm; }
  .totals td { padding: 1.2mm 2mm; }
  .totals .grand td {
    border-top: 0.4mm solid var(--primary);
    border-bottom: 0.4mm solid var(--primary);
    font-weight: 700;
    font-size: 1.08em;
  }

  .words {
    margin-top: 2mm;
    padding: 2mm 2.5mm;
    border: 0.2mm solid var(--border);
    background: color-mix(in srgb, var(--border) 22%, #fff);
    font-size: 0.94em;
  }

  /* --- parties ----------------------------------------------------------- */

  .parties { display: flex; gap: 6mm; }
  .party { flex: 1 1 0; }

  /* --- signature and seal ------------------------------------------------ */

  .signature-area {
    margin-top: calc(var(--section-gap) * 1.6);
    display: flex;
    justify-content: flex-end;
    gap: 8mm;
    align-items: flex-end;
  }
  .signature-block { text-align: center; min-width: 45mm; }
  .signature-block img { display: block; margin: 0 auto 1.5mm; }
  .signature-rule { border-top: 0.2mm solid var(--text); padding-top: 1.2mm; font-size: 0.92em; }
  .seal-block { text-align: center; }

  .footer-note {
    margin-top: var(--section-gap);
    padding-top: 2mm;
    border-top: 0.2mm solid var(--border);
    font-size: 0.88em;
    color: var(--muted);
  }
`;

export const buildStylesheet = (config: TemplateConfig, layoutCss: string): string =>
  [
    fontFaceCss(config.typography.fontFamily),
    `:root { ${themeVariables(config)} }`,
    BASE_PRINT_CSS,
    layoutCss,
  ]
    .filter(Boolean)
    .join('\n');
