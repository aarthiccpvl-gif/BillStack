import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildUser, mockApi, renderAt } from '@/test/harness';
import { apiClient } from '@/services/api-client';

/**
 * Customer module tests.
 *
 * The one that matters here is that the form actually submits. A create form that
 * fails its own client-side validation on a field the user cannot see does not
 * report anything — the button simply does nothing — so "the request went out" is
 * the assertion worth having.
 */

const openNewCustomerForm = async () => {
  const user = buildUser('ADMIN');
  mockApi(user);
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
    id: 12,
    customerCode: 'CUST-0012',
    name: 'Contoso Ltd',
    addresses: [],
    contacts: [],
  } as never);

  renderAt('/customers');
  await screen.findByRole('heading', { name: /customers/i });
  await userEvent.click(screen.getByRole('button', { name: /new customer/i }));
  await screen.findByRole('heading', { name: /new customer/i });

  return post;
};

describe('creating a customer', () => {
  it('submits the form and posts to the API', async () => {
    const post = await openNewCustomerForm();

    await userEvent.type(screen.getByLabelText(/customer name/i), 'Contoso Ltd');
    await userEvent.type(screen.getByLabelText(/^gstin/i), '29AAACS1234F1Z5');

    await userEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/customers');
    expect(body.name).toBe('Contoso Ltd');
  });

  it('sends the billing address as a real address, not as form strings', async () => {
    const post = await openNewCustomerForm();

    await userEvent.type(screen.getByLabelText(/customer name/i), 'Contoso Ltd');
    await userEvent.type(screen.getByLabelText(/^gstin/i), '29AAACS1234F1Z5');
    await userEvent.type(screen.getByLabelText(/address line 1/i), '12 Sample Road');
    await userEvent.type(screen.getByLabelText(/^city/i), 'Bengaluru');

    await userEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const [, body] = post.mock.calls[0] as [string, { addresses: Record<string, unknown>[] }];
    expect(body.addresses).toHaveLength(1);
    /* A hidden input would have made these the strings "BILLING" and "true"; the
       boolean is the half that Zod rejects, silently. */
    expect(body.addresses[0]).toMatchObject({
      type: 'BILLING',
      isDefault: true,
      line1: '12 Sample Road',
      city: 'Bengaluru',
    });
  });

  it('stores no address at all when the address fields are left empty', async () => {
    const post = await openNewCustomerForm();

    await userEvent.type(screen.getByLabelText(/customer name/i), 'Contoso Ltd');
    await userEvent.type(screen.getByLabelText(/^gstin/i), '29AAACS1234F1Z5');

    await userEvent.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const [, body] = post.mock.calls[0] as [string, { addresses: unknown[] }];
    expect(body.addresses).toEqual([]);
  });

  it('says which field is wrong instead of doing nothing', async () => {
    const post = await openNewCustomerForm();

    /* A registered business needs a GSTIN, so this submit must fail — and must
       say so rather than leaving the button looking dead. */
    await userEvent.type(screen.getByLabelText(/customer name/i), 'Contoso Ltd');
    await userEvent.click(screen.getByRole('button', { name: /create customer/i }));

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/registered business needs a gstin/i)).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });
});
