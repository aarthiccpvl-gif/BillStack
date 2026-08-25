import type { Browser } from 'puppeteer';
import { ERROR_CODES } from '@app/shared';
import { env, isProduction } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * HTML → PDF.
 *
 * One shared Chromium instance, launched lazily and reused: starting a browser per
 * document would dominate the response time. Concurrency is bounded because each
 * open page costs real memory, and pages are always closed in a `finally` so a
 * render that throws cannot leak one.
 */

export interface PdfOptions {
  headerTemplate?: string;
  footerTemplate?: string;
  marginsMm?: { top: number; right: number; bottom: number; left: number };
}

let browserPromise: Promise<Browser> | null = null;
let inFlight = 0;
const queue: (() => void)[] = [];

const launch = async (): Promise<Browser> => {
  const puppeteer = await import('puppeteer');

  return puppeteer.default.launch({
    headless: true,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      /* Required inside a container; harmless on a developer machine. */
      ...(isProduction ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });
};

const getBrowser = async (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = launch().catch((error: unknown) => {
      /* Do not cache a failed launch — the next request should try again. */
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

/** Simple semaphore: PDF rendering is memory-bound, not CPU-bound. */
const acquire = async (): Promise<void> => {
  if (inFlight < env.PDF_CONCURRENCY) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inFlight += 1;
};

const release = (): void => {
  inFlight -= 1;
  const next = queue.shift();
  if (next) next();
};

export const renderPdf = async (html: string, options: PdfOptions = {}): Promise<Buffer> => {
  await acquire();

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      /* The HTML is entirely self-contained — inline CSS, data: URI images — so
         there is nothing to wait for on the network. `load` is enough, and
         avoiding a networkidle wait keeps rendering fast and deterministic. */
      await page.setContent(html, { waitUntil: 'load', timeout: env.PDF_TIMEOUT_MS });

      const margins = options.marginsMm;
      const showFurniture = Boolean(options.headerTemplate || options.footerTemplate);

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: showFurniture,
        headerTemplate: options.headerTemplate ?? '<span></span>',
        footerTemplate: options.footerTemplate ?? '<span></span>',
        /* Chromium reserves these bands for the running header and footer. The
           document's own margins are applied in-flow by the stylesheet. */
        margin: showFurniture
          ? {
              top: `${Math.max(6, (margins?.top ?? 14) - 6)}mm`,
              bottom: `${Math.max(8, (margins?.bottom ?? 16) - 4)}mm`,
              left: '0mm',
              right: '0mm',
            }
          : { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
        timeout: env.PDF_TIMEOUT_MS,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (error) {
    logger.error({ err: error }, 'PDF generation failed');
    throw new AppError(
      ERROR_CODES.PDF_GENERATION_FAILED,
      502,
      'The document could not be rendered. Please try again.',
    );
  } finally {
    release();
  }
};

/** Confirms at boot that Chromium is actually usable, rather than at first download. */
export const smokeTestRenderer = async (): Promise<boolean> => {
  try {
    await renderPdf('<!doctype html><html><body>ok</body></html>');
    logger.info('PDF renderer ready');
    return true;
  } catch {
    logger.error(
      'PDF renderer is NOT available — check the Chromium install (npx puppeteer browsers install chrome).',
    );
    return false;
  }
};

export const closeRenderer = async (): Promise<void> => {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
};
