import { readFileSync } from 'node:fs';
import type { FontFamilyKey } from '@app/shared';

/**
 * Web fonts for the print pipeline.
 *
 * The Liberation/DejaVu stacks resolve against faces the host already has, so
 * they cost nothing. Poppins does not exist on a Linux container, and the
 * rendered HTML is not allowed to make network requests — a PDF must come out
 * identical on a developer's laptop and in production, and must render with the
 * network unplugged. So the two weights the documents actually use are read off
 * disk once and inlined as data URIs.
 *
 * Two weights only (400/600, latin, upright): ~21 KB of base64 per document.
 * Italics and the other weights would double that for text no template sets.
 */

const POPPINS_FILES: Record<number, string> = {
  400: '@fontsource/poppins/files/poppins-latin-400-normal.woff2',
  600: '@fontsource/poppins/files/poppins-latin-600-normal.woff2',
};

/** Built once per process: the read and the base64 are not worth repeating per PDF. */
let poppinsCss: string | null = null;

const buildPoppinsCss = (): string =>
  Object.entries(POPPINS_FILES)
    .map(([weight, specifier]) => {
      const data = readFileSync(require.resolve(specifier)).toString('base64');
      return `@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;base64,${data}) format('woff2');
}`;
    })
    .join('\n');

/**
 * `@font-face` rules a stylesheet must carry for the given family, or an empty
 * string for the stacks that need no embedding.
 */
export const fontFaceCss = (family: FontFamilyKey): string => {
  if (family !== 'poppins') return '';
  poppinsCss ??= buildPoppinsCss();
  return poppinsCss;
};
