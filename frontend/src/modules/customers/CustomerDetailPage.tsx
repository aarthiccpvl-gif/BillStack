import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { PERMISSIONS, TAX_TREATMENT_LABELS, formatMoney } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { customerKeys, customersApi } from '@/services/business-api';
import { useCurrencies } from '@/hooks/useMasters';
import { CustomerFormModal } from './CustomerFormModal';

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="col-sm-6 col-lg-4 mb-3">
    <div className="label-caps">{label}</div>
    <div>{value || <span className="text-secondary">—</span>}</div>
  </div>
);

export const CustomerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { data: currencies } = useCurrencies(true);
  const [editOpen, setEditOpen] = useState(false);

  const canEdit = hasPermission(PERMISSIONS.CUSTOMER_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.CUSTOMER_ARCHIVE);

  const customerQuery = useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: () => customersApi.get(customerId),
    enabled: Number.isFinite(customerId),
  });

  const summaryQuery = useQuery({
    queryKey: customerKeys.summary(customerId),
    queryFn: () => customersApi.summary(customerId),
    enabled: Number.isFinite(customerId),
  });

  const archiveMutation = useMutation({
    mutationFn: (archive: boolean) => customersApi.archive(customerId, archive),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(updated.status === 'ARCHIVED' ? 'Customer archived' : 'Customer restored');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status.'),
  });

  if (customerQuery.isError) {
    return (
      <ErrorState
        message={
          customerQuery.error instanceof ApiError
            ? customerQuery.error.message
            : 'Unexpected error.'
        }
        onRetry={() => void customerQuery.refetch()}
      />
    );
  }

  const customer = customerQuery.data;
  const summary = summaryQuery.data;
  const billing = customer?.addresses.find((address) => address.type === 'BILLING');
  const shipping = customer?.addresses.find((address) => address.type === 'SHIPPING');

  const formatFor = (code: string) =>
    currencies?.find((currency) => currency.code === code) ?? {
      code,
      symbol: code,
      decimalPlaces: 2,
      symbolPosition: 'PREFIX' as const,
      separatorStyle: 'WESTERN' as const,
    };

  return (
    <>
      <PageHeader
        title={customer?.name ?? 'Customer'}
        description={
          customer ? `${customer.customerCode} · ${customer.defaultCurrencyCode}` : undefined
        }
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Customers', to: '/customers' },
          { label: customer?.customerCode ?? '' },
        ]}
        actions={
          customer && (
            <>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil size={14} className="me-1" aria-hidden />
                  Edit
                </button>
              )}
              {canArchive && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(customer.status !== 'ARCHIVED')}
                >
                  {customer.status === 'ARCHIVED' ? (
                    <>
                      <ArchiveRestore size={14} className="me-1" aria-hidden />
                      Restore
                    </>
                  ) : (
                    <>
                      <Archive size={14} className="me-1" aria-hidden />
                      Archive
                    </>
                  )}
                </button>
              )}
            </>
          )
        }
      />

      {customer?.status === 'ARCHIVED' && (
        <div className="alert alert-secondary py-2 small" role="status">
          This customer is archived. Existing documents are untouched, but no new ones can be raised
          against them until they are restored.
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xl-8">
          <div className="card mb-3">
            <div className="card-header bg-white">
              <span className="label-caps">Customer information</span>
            </div>
            <div className="card-body">
              <div className="row">
                <Detail label="Company" value={customer?.companyName} />
                <Detail label="Contact person" value={customer?.contactPerson} />
                <Detail label="Email" value={customer?.email} />
                <Detail label="Phone" value={customer?.phone} />
                <Detail label="Alternate phone" value={customer?.altPhone} />
                <Detail
                  label="Payment terms"
                  value={customer ? `${customer.paymentTermsDays} days` : null}
                />
              </div>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header bg-white">
              <span className="label-caps">Tax information</span>
            </div>
            <div className="card-body">
              <div className="row">
                <Detail
                  label="Treatment"
                  value={customer ? TAX_TREATMENT_LABELS[customer.taxTreatment] : null}
                />
                <Detail
                  label="GSTIN"
                  value={customer?.gstin && <span className="text-mono">{customer.gstin}</span>}
                />
                <Detail
                  label="PAN"
                  value={customer?.pan && <span className="text-mono">{customer.pan}</span>}
                />
                <Detail label="Place of supply" value={customer?.placeOfSupplyStateCode} />
              </div>
            </div>
          </div>

          <div className="row g-3">
            {[
              { title: 'Billing address', address: billing },
              { title: 'Shipping address', address: shipping },
            ].map(({ title, address }) => (
              <div className="col-md-6" key={title}>
                <div className="card h-100">
                  <div className="card-header bg-white">
                    <span className="label-caps">{title}</span>
                  </div>
                  <div className="card-body">
                    {address ? (
                      <address className="mb-0">
                        {[address.line1, address.line2].filter(Boolean).map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                        <div>{[address.city, address.state].filter(Boolean).join(', ')}</div>
                        <div>{[address.country, address.postalCode].filter(Boolean).join(' ')}</div>
                        {address.stateCode && (
                          <div className="small text-secondary mt-1">
                            State code {address.stateCode}
                          </div>
                        )}
                      </address>
                    ) : (
                      <span className="text-secondary small">Not recorded</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card mb-3">
            <div className="card-header bg-white">
              <span className="label-caps">Activity</span>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between mb-2">
                <span className="text-secondary">Quotations</span>
                <span className="text-numeric fw-medium">{summary?.quotationCount ?? 0}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-secondary">Invoices</span>
                <span className="text-numeric fw-medium">{summary?.invoiceCount ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header bg-white">
              <span className="label-caps">Totals by currency</span>
            </div>
            <div className="card-body">
              {summary && summary.byCurrency.length > 0 ? (
                summary.byCurrency.map((row) => (
                  <div key={row.currencyCode} className="mb-3">
                    <div className="fw-medium mb-1">{row.currencyCode}</div>
                    <div className="d-flex justify-content-between small">
                      <span className="text-secondary">Quoted</span>
                      <span className="text-numeric">
                        {formatMoney(row.quotationTotal, formatFor(row.currencyCode))}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between small">
                      <span className="text-secondary">Invoiced</span>
                      <span className="text-numeric">
                        {formatMoney(row.invoiceTotal, formatFor(row.currencyCode))}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between small">
                      <span className="text-secondary">Outstanding</span>
                      <span className="text-numeric fw-medium">
                        {formatMoney(row.outstanding, formatFor(row.currencyCode))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="small text-secondary mb-0">
                  No documents yet. Totals are kept per currency rather than added together —
                  summing rupees and dollars would be meaningless.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {customer && (
        <CustomerFormModal
          open={editOpen}
          customer={customer}
          onClose={() => {
            setEditOpen(false);
            void queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
          }}
        />
      )}

      {!Number.isFinite(customerId) && (
        <button type="button" className="btn btn-link" onClick={() => navigate('/customers')}>
          Back to customers
        </button>
      )}
    </>
  );
};
