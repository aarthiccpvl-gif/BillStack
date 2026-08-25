import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { DocumentData, TemplateConfig } from '@app/shared';
import { getLayout } from './registry';
import { buildStylesheet } from './theme';

/**
 * The renderer.
 *
 * One function produces the HTML for both the on-screen preview and the PDF, so
 * "the PDF doesn't match the preview" is structurally impossible rather than a bug
 * to keep fixing.
 *
 * The output is entirely self-contained — the stylesheet is inline and every image
 * is a data: URI — so rendering makes no network requests. That is what makes it
 * deterministic, fast, and able to run with no outbound access at all.
 */

export interface RenderOptions {
  data: DocumentData;
  config: TemplateConfig;
  engineKey: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const renderDocumentHtml = ({ data, config, engineKey }: RenderOptions): string => {
  const layout = getLayout(engineKey);
  const body = renderToStaticMarkup(createElement(layout.Layout, { data, config }));
  const css = buildStylesheet(config, layout.css);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`${config.layout.documentTitle} ${data.number}`)}</title>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
};

/**
 * Header and footer for Chromium's paginated output.
 *
 * These are drawn by the print engine on every page rather than being part of the
 * flow, which is how page numbers and a repeated document number work at all.
 * Chromium renders them at a default 10px with no inherited styles, so everything
 * they need is stated inline.
 */
export const buildPageFurniture = (
  data: DocumentData,
  config: TemplateConfig,
): { headerTemplate: string; footerTemplate: string } => {
  const { footer } = config.layout;
  const marginLeft = config.layout.marginsMm.left;
  const marginRight = config.layout.marginsMm.right;

  const headerTemplate = config.layout.showHeaderOnAllPages
    ? `<div style="font-size:7pt;color:#666;width:100%;padding:0 ${marginRight}mm 0 ${marginLeft}mm;
         display:flex;justify-content:space-between;">
         <span>${escapeHtml(data.company.name)}</span>
         <span>${escapeHtml(data.number)}</span>
       </div>`
    : '<span></span>';

  const pieces: string[] = [];
  if (footer.text) pieces.push(escapeHtml(footer.text));
  if (footer.showGeneratedAt) {
    pieces.push(`Generated ${escapeHtml(data.meta.generatedAt.slice(0, 10))}`);
  }

  const left = pieces.join(' · ');
  const right = footer.showPageNumbers
    ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
    : '';

  const footerTemplate =
    left || right
      ? `<div style="font-size:7pt;color:#666;width:100%;padding:0 ${marginRight}mm 0 ${marginLeft}mm;
           display:flex;justify-content:space-between;">
           <span>${left}</span><span>${right}</span>
         </div>`
      : '<span></span>';

  return { headerTemplate, footerTemplate };
};
