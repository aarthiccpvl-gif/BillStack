import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import {
  PAYABLE_INVOICE_STATUSES,
  PERMISSIONS,
  formatMoney,
  type CurrencyFormat,
  type InvoiceRecord,
} from '@app/shared';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { invoiceKeys, invoicesApi } from '@/services/invoices-api';
import { formatDate, todayIso } from '@/utils/format';

/**
 * Recording what has been received (decision Q2 — a figure, not a ledger).
 *
 * Only the amount is entered. Whether that makes the invoice partly paid, settled
 * or owed again is the server's conclusion, not a second dropdown that could
 * disagree with it — "PAID, nothing received" must not be expressible.
 */
export const PaymentPanel = ({
  invoice,
  currency,
}: {
  invoice: InvoiceRecord;
  currency: CurrencyFormat;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const canRecord =
    hasPermission(PERMISSIONS.PAYMENT_STATUS_UPDATE) &&
    PAYABLE_INVOICE_STATUSES.includes(invoice.status);

  const [amount, setAmount] = useState(invoice.amountPaid);
  const [reference, setReference] = useState(invoice.paymentReference ?? '');
  const [paidOn, setPaidOn] = useState(todayIso());

  const mutation = useMutation({
    mutationFn: () =>
      invoicesApi.recordPayment(invoice.id, {
        amountPaid: amount.trim() || '0',
        paymentReference: reference.trim() || null,
        paidOn,
      }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success(
        updated.status === 'PAID'
          ? `${updated.number} is settled in full`
          : `Recorded — ${formatMoney(updated.amountOutstanding, currency)} still outstanding`,
      );
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not record the payment.'),
  });

  const settled = Number(invoice.amountOutstanding) === 0 && Number(invoice.amountPaid) > 0;

  return (
    <div className="card">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">Payment</span>
        {invoice.isOverdue && (
          <span className="badge text-bg-danger">
            {invoice.daysOverdue} day{invoice.daysOverdue === 1 ? '' : 's'} late
          </span>
        )}
      </div>

      <div className="card-body">
        <div className="d-flex justify-content-between py-1">
          <span className="text-secondary">Invoice total</span>
          <span className="text-numeric">{formatMoney(invoice.grandTotal, currency)}</span>
        </div>
        <div className="d-flex justify-content-between py-1">
          <span className="text-secondary">Received</span>
          <span className="text-numeric">{formatMoney(invoice.amountPaid, currency)}</span>
        </div>
        <div className="d-flex justify-content-between py-1 fw-semibold border-top pt-2">
          <span>Outstanding</span>
          <span className={`text-numeric${invoice.isOverdue ? ' text-danger' : ''}`}>
            {formatMoney(invoice.amountOutstanding, currency)}
          </span>
        </div>

        {invoice.dueDate && (
          <div className="small text-secondary mt-1">
            {settled
              ? `Settled${invoice.paidAt ? ` on ${formatDate(invoice.paidAt.slice(0, 10))}` : ''}`
              : `Due ${formatDate(invoice.dueDate)}`}
          </div>
        )}

        {invoice.paymentReference && (
          <div className="small text-secondary">Reference: {invoice.paymentReference}</div>
        )}

        {canRecord && (
          <div className="border-top mt-3 pt-3">
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small text-secondary mb-1" htmlFor="amount-paid">
                  Amount received
                </label>
                <input
                  id="amount-paid"
                  className="form-control form-control-sm text-numeric"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="col-6">
                <label className="form-label small text-secondary mb-1" htmlFor="paid-on">
                  Received on
                </label>
                <input
                  id="paid-on"
                  type="date"
                  className="form-control form-control-sm"
                  value={paidOn}
                  onChange={(event) => setPaidOn(event.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label small text-secondary mb-1" htmlFor="payment-reference">
                  Reference
                </label>
                <input
                  id="payment-reference"
                  className="form-control form-control-sm"
                  placeholder="NEFT / cheque number"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
            </div>

            <div className="d-flex gap-2 mt-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                <Banknote size={14} className="me-1" aria-hidden />
                {mutation.isPending ? 'Recording…' : 'Record'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={mutation.isPending}
                onClick={() => setAmount(invoice.grandTotal)}
              >
                Paid in full
              </button>
            </div>

            <p className="small text-secondary mb-0 mt-2">
              The status follows the amount: part of the total marks it partially paid, all of it
              marks it paid, and zero returns it to issued.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
