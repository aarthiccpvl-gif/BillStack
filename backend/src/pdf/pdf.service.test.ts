import { afterAll, describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { defaultTemplateConfig } from '@app/shared';
import { buildSampleDocument } from '../render/sample-data';
import { buildPageFurniture, renderDocumentHtml } from '../render/render.service';
import { closeRenderer, renderPdf } from './pdf.service';

/**
 * PDF assertions against a real Chromium.
 *
 * Slower than the rest of the suite, and deliberately so: page count, repeated
 * headers and page numbering are exactly the things that only break in the real
 * print engine, and they are the ones a customer notices.
 */

const PDF_TIMEOUT = 60_000;

const buildPdf = async (
  lineCount: number,
  mutate?: (c: ReturnType<typeof defaultTemplateConfig>) => void,
) => {
  const config = defaultTemplateConfig('TAX INVOICE');
  mutate?.(config);

  const data = buildSampleDocument({ docType: 'INVOICE', lineCount });
  const html = renderDocumentHtml({ data, config, engineKey: 'corporate' });
  const furniture = buildPageFurniture(data, config);

  const buffer = await renderPdf(html, { ...furniture, marginsMm: config.layout.marginsMm });

  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return { buffer, text: parsed.text, pages: parsed.total };
  } finally {
    await parser.destroy();
  }
};

afterAll(async () => {
  await closeRenderer();
});

describe('PDF output', () => {
  it(
    'fits a compact document on a single A4 page',
    async () => {
      /* One line with the optional sections off — what a short invoice looks like. */
      const { buffer, pages, text } = await buildPdf(1, (config) => {
        config.sections.bankDetails = false;
        config.sections.notes = false;
        config.sections.terms = false;
        config.sections.taxSummary = false;
      });

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.byteLength).toBeGreaterThan(1000);
      expect(pages).toBe(1);
      expect(text).toContain('FT001/2026-2027');
      expect(text).toContain('TAX INVOICE');
    },
    PDF_TIMEOUT,
  );

  it(
    'flows a long document onto multiple pages and numbers them',
    async () => {
      const { pages, text } = await buildPdf(45);

      expect(pages).toBeGreaterThan(1);
      /* Chromium draws the footer, so the numbering proves the furniture works. */
      expect(text).toContain(`Page 1 of ${pages}`);
      expect(text).toContain(`Page ${pages} of ${pages}`);
    },
    PDF_TIMEOUT,
  );

  it(
    'repeats the items-table header on every page',
    async () => {
      const { text } = await buildPdf(45);

      /* "Amount" is a column header; it must appear at least once per page. */
      const occurrences = text.split('Amount').length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    },
    PDF_TIMEOUT,
  );

  it(
    'prints currency, totals and the amount in words',
    async () => {
      const { text } = await buildPdf(4);

      expect(text).toContain('₹');
      expect(text).toContain('Subtotal');
      expect(text).toContain('Taxable value');
      /* Indian lakh grouping survives into the PDF, not just the browser. */
      expect(text).toMatch(/₹\d,\d{2},\d{3}\.\d{2}/);
      /* Section labels are uppercased by the stylesheet, so match case-insensitively. */
      expect(text).toMatch(/amount in words/i);
      expect(text).toMatch(/Rupees.*Only/);
    },
    PDF_TIMEOUT,
  );

  it(
    'prints the GST breakdown as separate components',
    async () => {
      const { text } = await buildPdf(4);

      expect(text).toContain('CGST 9%');
      expect(text).toContain('SGST 9%');
      expect(text).toMatch(/tax summary/i);
    },
    PDF_TIMEOUT,
  );

  it(
    'embeds an uploaded logo in the file',
    async () => {
      /* A 1×1 red PNG — enough to prove the image reaches the PDF. */
      const png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const config = defaultTemplateConfig('TAX INVOICE');
      const data = buildSampleDocument({
        docType: 'INVOICE',
        company: { logo: { dataUri: png } },
      });

      const buffer = await renderPdf(renderDocumentHtml({ data, config, engineKey: 'corporate' }));

      /* An embedded raster becomes an image XObject in the PDF. */
      expect(buffer.includes(Buffer.from('/Image'))).toBe(true);
    },
    PDF_TIMEOUT,
  );

  it(
    'omits page numbers when the template switches them off',
    async () => {
      const { text } = await buildPdf(4, (config) => {
        config.layout.footer.showPageNumbers = false;
      });

      expect(text).not.toContain('Page 1 of');
    },
    PDF_TIMEOUT,
  );
});
