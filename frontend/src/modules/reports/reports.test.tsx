import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildUser, FINANCIAL_YEARS, mockApi, renderAt } from '@/test/harness';
import * as apiClientModule from '@/services/api-client';

/**
 * Reports and the audit trail.
 *
 * The property worth testing here is that the export asks for exactly what the
 * screen is showing: same report, same filters, one extra parameter for the
 * format. If those ever diverge, the file a finance user sends to their
 * accountant stops matching the screen they checked it against.
 */

describe('the reports page', () => {
  it('opens on invoices and shows the totals row', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/reports');

    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByText('FT001/2026-2027')).toBeInTheDocument();

    /* The API sends 50800.00; the screen groups it the Indian way because the
       row says the currency is INR. Row and total agree, so there are two. */
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Total · INR · 1')).toBeInTheDocument();
    expect(table.getAllByText('50,800.00')).toHaveLength(2);
    expect(table.getAllByText('70,800.00')).toHaveLength(2);
  });

  it('offers the four reports as tabs', async () => {
    mockApi(buildUser('ADMIN'));
    renderAt('/reports');

    for (const label of ['Invoices', 'Quotations', 'Customers', 'Monthly summary']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('hides the status filter on a report that has no statuses', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));
    renderAt('/reports');

    expect(await screen.findByLabelText('Status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Monthly summary' }));
    await waitFor(() => expect(screen.queryByLabelText('Status')).not.toBeInTheDocument());
  });
});

describe('an export asks for what the screen is showing', () => {
  it('carries the same filters, plus the format', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));

    /* The export goes through the raw client rather than the JSON envelope. */
    const request = vi.spyOn(apiClientModule.http, 'get').mockResolvedValue({
      data: new Blob(['number,customer\r\n']),
      headers: { 'content-disposition': 'attachment; filename="invoices-2026-08-26.csv"' },
    } as never);

    renderAt('/reports');
    await screen.findByText('FT001/2026-2027');

    await user.type(screen.getByLabelText('From date'), '2026-04-01');
    await user.click(screen.getByLabelText('Unpaid only'));
    await user.click(screen.getByRole('button', { name: /^CSV$/ }));

    await waitFor(() => expect(request).toHaveBeenCalled());

    const url = String(request.mock.calls[0]?.[0]);
    expect(url).toContain('/export/invoices');
    expect(url).toContain('dateFrom=2026-04-01');
    expect(url).toContain('outstandingOnly=true');
    expect(url).toContain('format=csv');
  });

  it('asks for the spreadsheet and the PDF from the same place', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'));

    const request = vi.spyOn(apiClientModule.http, 'get').mockResolvedValue({
      data: new Blob(['x']),
      headers: {},
    } as never);

    renderAt('/reports');
    await screen.findByText('FT001/2026-2027');

    await user.click(screen.getByRole('button', { name: /^Excel$/ }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(String(request.mock.calls[0]?.[0])).toContain('format=xlsx');

    request.mockClear();
    await user.click(screen.getByRole('button', { name: /^PDF$/ }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(String(request.mock.calls[0]?.[0])).toContain('format=pdf');
  });

  it('scopes both the screen and the export to the global financial year', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('ADMIN'), {
      get: { '/masters/financial-years': FINANCIAL_YEARS },
    });

    const request = vi.spyOn(apiClientModule.http, 'get').mockResolvedValue({
      data: new Blob(['number,customer\r\n']),
      headers: { 'content-disposition': 'attachment; filename="invoices-2026-08-26.csv"' },
    } as never);

    renderAt('/reports');
    await screen.findByText('FT001/2026-2027');

    const requested = () =>
      (apiClientModule.apiClient.get as unknown as { mock: { calls: [string][] } }).mock.calls.map(
        ([url]) => url,
      );

    /* The screen's own report query carries the year first. */
    await waitFor(() =>
      expect(
        requested().some(
          (url) => url.startsWith('/reports/invoices') && url.includes('financialYearId=2'),
        ),
      ).toBe(true),
    );

    await user.click(screen.getByRole('button', { name: /^CSV$/ }));
    await waitFor(() => expect(request).toHaveBeenCalled());

    /* The export is the same query in another container, so it carries the year too. */
    expect(String(request.mock.calls[0]?.[0])).toContain('financialYearId=2');
  });

  it('is not offered to a role without the export permission', async () => {
    mockApi(
      buildUser('ADMIN', {
        permissions: ['report.read', 'dashboard.read', 'invoice.read'] as never,
      }),
    );
    renderAt('/reports');

    await screen.findByRole('heading', { level: 1, name: 'Reports' });
    expect(screen.queryByRole('button', { name: /^CSV$/ })).not.toBeInTheDocument();
  });
});

describe('the audit log viewer', () => {
  it('reads as sentences rather than enum names', async () => {
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/admin/audit');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Audit Logs' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/changed the status of invoice FT001\/2026-2027/),
    ).toBeInTheDocument();
  });

  it('links an entry to the document it happened to', async () => {
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/admin/audit');

    const link = await screen.findByRole('link', { name: 'open' });
    expect(link).toHaveAttribute('href', '/invoices/9');
  });

  it('opens one entry to show what actually changed', async () => {
    const user = userEvent.setup();
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/admin/audit');

    await screen.findByText(/changed the status of invoice/);
    await user.click(screen.getByRole('button', { name: /Show the detail/ }));

    expect(await screen.findByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByText(/"DRAFT"/)).toBeInTheDocument();
  });

  it('says plainly that nothing here can be edited', async () => {
    mockApi(buildUser('SUPER_ADMIN'));
    renderAt('/admin/audit');

    expect(await screen.findByText(/Nothing here can be edited or removed/i)).toBeInTheDocument();
  });

  it('is part of a Finance Viewer’s surface', async () => {
    mockApi(buildUser('FINANCE_VIEWER'));
    renderAt('/admin/audit');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Audit Logs' }),
    ).toBeInTheDocument();
  });
});
