import { describe, expect, it } from 'vitest';
import { defaultTemplateConfig, templateConfigSchema } from '@app/shared';
import { buildSampleDocument } from './sample-data';
import { buildPageFurniture, renderDocumentHtml } from './render.service';
import { layoutKeys } from './registry';

const config = () => defaultTemplateConfig('TAX INVOICE');
const invoice = () => buildSampleDocument({ docType: 'INVOICE' });

describe('every layout renders', () => {
  it.each(layoutKeys)('%s produces a complete HTML document', (engineKey) => {
    const html = renderDocumentHtml({ data: invoice(), config: config(), engineKey });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
  });

  it.each(layoutKeys)('%s shows the number, customer and grand total', (engineKey) => {
    const data = invoice();
    const html = renderDocumentHtml({ data, config: config(), engineKey });

    expect(html).toContain('FT001/2026-2027');
    expect(html).toContain('Sample Customer');
    /* ₹ with Indian lakh grouping — the same formatter the UI uses. */
    expect(html).toMatch(/₹[\d,]+\.\d{2}/);
  });
});

describe('the rendered HTML is self-contained', () => {
  it('makes no network requests — no external stylesheet, script or image', () => {
    const html = renderDocumentHtml({ data: invoice(), config: config(), engineKey: 'corporate' });

    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/);
    expect(html).not.toContain('@import');
  });

  it('inlines a logo as a data URI rather than linking it', () => {
    const data = buildSampleDocument({
      docType: 'INVOICE',
      company: { logo: { dataUri: 'data:image/png;base64,iVBORw0KGgo=' } },
    });
    const html = renderDocumentHtml({ data, config: config(), engineKey: 'corporate' });

    expect(html).toContain('src="data:image/png;base64,');
  });
});

describe('print correctness', () => {
  const html = () =>
    renderDocumentHtml({ data: invoice(), config: config(), engineKey: 'corporate' });

  it('repeats the items-table header on every page', () => {
    expect(html()).toContain('display: table-header-group');
  });

  it('never splits a row or the totals across a page', () => {
    const css = html();
    expect(css).toContain('break-inside: avoid');
    expect(css).toMatch(/\.totals\s*\{[^}]*break-before:\s*avoid/);
  });

  it('sets A4 with margins applied in-flow, not by @page', () => {
    const css = html();
    expect(css).toContain('size: A4');
    expect(css).toMatch(/@page\s*\{\s*size:\s*A4;\s*margin:\s*0;/);
  });
});

describe('section switches actually change the output', () => {
  const render = (mutate: (c: ReturnType<typeof config>) => void) => {
    const c = config();
    mutate(c);
    return renderDocumentHtml({ data: invoice(), config: c, engineKey: 'corporate' });
  };

  it('hides bank details when the section is off', () => {
    expect(render(() => {})).toContain('Payment details');
    expect(render((c) => (c.sections.bankDetails = false))).not.toContain('Payment details');
  });

  it('hides the tax summary when the section is off', () => {
    expect(render(() => {})).toContain('Tax summary');
    expect(render((c) => (c.sections.taxSummary = false))).not.toContain('Tax summary');
  });

  it('hides the amount in words when the section is off', () => {
    expect(render(() => {})).toContain('Amount in words');
    expect(render((c) => (c.sections.amountInWords = false))).not.toContain('Amount in words');
  });

  it('shows the shipping address only when asked', () => {
    expect(render(() => {})).not.toContain('Ship to');
    expect(render((c) => (c.sections.shippingAddress = true))).toContain('Ship to');
  });

  it('drops a column when it is switched off', () => {
    const withHsn = render(() => {});
    expect(withHsn).toContain('998314');

    const withoutHsn = render((c) => {
      const hsn = c.layout.itemColumns.find((column) => column.key === 'hsn');
      const amount = c.layout.itemColumns.find((column) => column.key === 'amount');
      if (hsn && amount) {
        hsn.show = false;
        /* Keep the visible widths at 100 so the config stays valid. */
        amount.widthPct += hsn.widthPct;
      }
    });
    expect(withoutHsn).not.toContain('HSN/SAC');
  });

  it('uses the configured document title', () => {
    expect(render((c) => (c.layout.documentTitle = 'PROFORMA INVOICE'))).toContain(
      'PROFORMA INVOICE',
    );
  });
});

describe('signature and seal (decision Q13)', () => {
  const withAssets = () =>
    buildSampleDocument({
      docType: 'INVOICE',
      company: {
        signature: { dataUri: 'data:image/png;base64,SIGNATURE' },
        seal: { dataUri: 'data:image/png;base64,SEAL' },
      },
    });

  it('renders both images when both sections are on', () => {
    const html = renderDocumentHtml({
      data: withAssets(),
      config: config(),
      engineKey: 'corporate',
    });
    expect(html).toContain('base64,SIGNATURE');
    expect(html).toContain('base64,SEAL');
  });

  it('hides the seal independently of the signature', () => {
    const c = config();
    c.sections.seal = false;

    const html = renderDocumentHtml({ data: withAssets(), config: c, engineKey: 'corporate' });
    expect(html).toContain('base64,SIGNATURE');
    expect(html).not.toContain('base64,SEAL');
  });

  it('hides the signature independently of the seal', () => {
    const c = config();
    c.sections.signature = false;

    const html = renderDocumentHtml({ data: withAssets(), config: c, engineKey: 'corporate' });
    expect(html).not.toContain('base64,SIGNATURE');
    expect(html).toContain('base64,SEAL');
  });
});

describe('page furniture', () => {
  it('asks Chromium for page numbers when configured', () => {
    const { footerTemplate } = buildPageFurniture(invoice(), config());
    expect(footerTemplate).toContain('class="pageNumber"');
    expect(footerTemplate).toContain('class="totalPages"');
  });

  it('omits page numbers when switched off', () => {
    const c = config();
    c.layout.footer.showPageNumbers = false;

    const { footerTemplate } = buildPageFurniture(invoice(), c);
    expect(footerTemplate).not.toContain('pageNumber');
  });

  it('repeats the document number in the header only when asked', () => {
    const c = config();
    expect(buildPageFurniture(invoice(), c).headerTemplate).toBe('<span></span>');

    c.layout.showHeaderOnAllPages = true;
    expect(buildPageFurniture(invoice(), c).headerTemplate).toContain('FT001/2026-2027');
  });

  it('escapes values rather than injecting them raw', () => {
    const data = invoice();
    data.company.name = '<script>alert(1)</script>';

    const c = config();
    c.layout.showHeaderOnAllPages = true;

    const { headerTemplate } = buildPageFurniture(data, c);
    expect(headerTemplate).not.toContain('<script>');
    expect(headerTemplate).toContain('&lt;script&gt;');
  });
});

describe('config validation guards the renderer', () => {
  it('rejects item column widths that do not total 100', () => {
    const c = config();
    const first = c.layout.itemColumns[0];
    if (first) first.widthPct = 50;

    const result = templateConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/total 100%/);
  });

  it('rejects a font outside the whitelist, so the PDF cannot lose its typeface', () => {
    const c = config() as unknown as { typography: { fontFamily: string } };
    c.typography.fontFamily = 'Comic Sans MS';
    expect(templateConfigSchema.safeParse(c).success).toBe(false);
  });
});

describe('quotation rendering', () => {
  it('shows a validity date rather than a due date', () => {
    const data = buildSampleDocument({ docType: 'QUOTATION' });
    const html = renderDocumentHtml({
      data,
      config: defaultTemplateConfig('QUOTATION'),
      engineKey: 'modern',
    });

    expect(html).toContain('QT001/2026-2027');
    expect(html).toContain('Valid until');
    expect(html).not.toContain('Due date');
  });
});
