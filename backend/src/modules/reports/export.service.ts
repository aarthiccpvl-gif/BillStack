import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { toDateOnlyString, type ReportFilters } from '@app/shared';
import { recordAudit } from '../../services/audit.service';
import { renderPdf } from '../../pdf/pdf.service';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../utils/errors';
import { REPORTS, type ReportDefinition } from './report.queries';
import { reportFileName } from './reports.service';
import { renderReportHtml } from './report-template';

/**
 * Report exports.
 *
 * All three formats read the same report definition the screen reads, so an
 * export cannot show different rows from the list that produced it. None of them
 * builds the whole result in memory first:
 *
 *   CSV   written straight to the response, a row at a time
 *   XLSX  ExcelJS's streaming workbook writer, committing each row as it goes
 *   PDF   rendered from HTML, which does need the rows — so it is capped, and
 *         says so on the page rather than quietly cutting the table short
 *
 * The cap exists because a PDF of fifty thousand rows is not a document anyone
 * wants; CSV and XLSX have no cap at all.
 */

const PDF_ROW_CAP = 2_000;

/** Escapes one CSV cell, and defuses the spreadsheet-formula injection trick. */
const csvCell = (value: string): string => {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const escaped = (dangerous ? `'${value}` : value).replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
};

const definitionFor = (kind: string): ReportDefinition => {
  const definition = REPORTS[kind];
  if (!definition) throw new NotFoundError('Report');
  return definition;
};

const auditExport = async (
  kind: string,
  format: string,
  rowCount: number,
  filters: ReportFilters,
) =>
  recordAudit({
    action: 'REPORT_EXPORTED',
    entityType: 'REPORT',
    entityLabel: `${kind}.${format}`,
    metadata: { rows: rowCount, filters: filters as unknown as Record<string, unknown> },
  });

// -------------------------------------------------------------------- csv ---

export const streamCsv = async (
  kind: string,
  filters: ReportFilters,
  res: Response,
): Promise<void> => {
  const definition = definitionFor(kind);
  const fileName = reportFileName(kind, 'csv');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  /* A BOM, so Excel on Windows opens ₹ and – as themselves rather than as mojibake. */
  res.write('﻿');
  res.write(`${definition.columns.map((column) => csvCell(column.label)).join(',')}\r\n`);

  let rowCount = 0;
  for await (const row of definition.rows(filters)) {
    res.write(
      `${definition.columns.map((column) => csvCell(row[column.key] ?? '')).join(',')}\r\n`,
    );
    rowCount += 1;
  }

  const totals = await definition.totals(filters);
  for (const total of totals) {
    const cells = definition.columns.map((column, index) => {
      if (index === 0) return csvCell(`Total (${total.currencyCode}, ${total.count})`);
      return csvCell(total.values[column.key] ?? '');
    });
    res.write(`${cells.join(',')}\r\n`);
  }

  await auditExport(kind, 'csv', rowCount, filters);
  res.end();
};

// ------------------------------------------------------------------- xlsx ---

export const streamXlsx = async (
  kind: string,
  filters: ReportFilters,
  res: Response,
): Promise<void> => {
  const definition = definitionFor(kind);
  const fileName = reportFileName(kind, 'xlsx');

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.creator = 'Invoice & Quotation Management';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(definition.title, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = definition.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.numeric ? 16 : Math.max(14, Math.min(column.label.length + 8, 40)),
    style: column.numeric
      ? { numFmt: '#,##0.00;[Red]-#,##0.00', alignment: { horizontal: 'right' } }
      : {},
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E40' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  header.commit();

  /* Numbers go in as numbers so a spreadsheet can total a column; the strings the
     report produced are display text, and Excel would treat them as labels. */
  const numeric = new Set(
    definition.columns.filter((column) => column.numeric).map((column) => column.key),
  );

  const toCell = (key: string, value: string): string | number => {
    if (!numeric.has(key)) return value;
    const parsed = Number(value.replace(/,/g, ''));
    return value === '' || Number.isNaN(parsed) ? value : parsed;
  };

  let rowCount = 0;
  for await (const row of definition.rows(filters)) {
    sheet
      .addRow(
        Object.fromEntries(
          definition.columns.map((column) => [
            column.key,
            toCell(column.key, row[column.key] ?? ''),
          ]),
        ),
      )
      .commit();
    rowCount += 1;
  }

  const totals = await definition.totals(filters);
  for (const total of totals) {
    const values = Object.fromEntries(
      definition.columns.map((column, index) => [
        column.key,
        index === 0
          ? `Total (${total.currencyCode}, ${total.count})`
          : toCell(column.key, total.values[column.key] ?? ''),
      ]),
    );

    const totalRow = sheet.addRow(values);
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: 'thin' } };
    totalRow.commit();
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: definition.columns.length },
  };

  sheet.commit();
  await auditExport(kind, 'xlsx', rowCount, filters);
  await workbook.commit();
};

// -------------------------------------------------------------------- pdf ---

export const streamReportPdf = async (
  kind: string,
  filters: ReportFilters,
  res: Response,
): Promise<void> => {
  const definition = definitionFor(kind);

  const rows: Record<string, string>[] = [];
  for await (const row of definition.rows(filters, PDF_ROW_CAP)) rows.push(row);

  const [rowCount, totals, company, currencyRows] = await Promise.all([
    definition.count(filters),
    definition.totals(filters),
    prisma.companySettings.findUnique({ where: { id: 1 } }),
    prisma.currency.findMany(),
  ]);

  const currencies = Object.fromEntries(
    currencyRows.map((currency) => [
      currency.code,
      {
        code: currency.code,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        symbolPosition: currency.symbolPosition,
        separatorStyle: currency.separatorStyle,
      },
    ]),
  );

  const html = renderReportHtml({
    title: definition.title,
    companyName: company?.companyName ?? 'Company',
    generatedOn: toDateOnlyString(new Date()),
    columns: definition.columns,
    rows,
    totals,
    rowCount,
    capped: rowCount > rows.length ? PDF_ROW_CAP : null,
    filters,
    currencies,
  });

  /* Landscape and the margins come from the template's own @page rule, which
     `preferCSSPageSize` honours — so a wide report is wide without changing the
     shape of every other PDF the application produces. */
  const buffer = await renderPdf(html);

  await auditExport(kind, 'pdf', rows.length, filters);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(kind, 'pdf')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buffer);
};
