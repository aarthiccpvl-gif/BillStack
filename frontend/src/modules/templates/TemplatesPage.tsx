import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, Plus, ReceiptText, Star } from 'lucide-react';
import { PERMISSIONS, type TemplateRecord } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { templateKeys, templatesApi } from '@/services/templates-api';
import { NewTemplateModal } from './NewTemplateModal';

const VERSION_BADGE: Record<string, string> = {
  PUBLISHED: 'text-bg-success',
  DRAFT: 'text-bg-warning',
  ARCHIVED: 'text-bg-light',
};

const TemplateCard = ({
  template,
  canManage,
  canPublish,
}: {
  template: TemplateRecord;
  canManage: boolean;
  canPublish: boolean;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: templateKeys.all });

  const defaultMutation = useMutation({
    mutationFn: () => templatesApi.setDefault(template.id),
    onSuccess: async () => {
      await invalidate();
      toast.success(`${template.name} is now the default`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the default.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => templatesApi.duplicate(template.id),
    onSuccess: async (created) => {
      await invalidate();
      toast.success(`Created ${created.name}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not duplicate.'),
  });

  const draft = template.versions.find((version) => version.status === 'DRAFT');

  return (
    <div className="col-12 col-lg-6 col-xxl-4">
      <div className="card h-100">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
            <div>
              <span className="fw-semibold">{template.name}</span>
              {template.isDefault && <span className="badge text-bg-primary ms-2">Default</span>}
              <div className="small text-secondary mt-1">{template.description}</div>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-1 mb-3">
            {template.versions.slice(0, 4).map((version) => (
              <span key={version.id} className={`badge ${VERSION_BADGE[version.status]}`}>
                v{version.version} · {version.status.toLowerCase()}
                {version.documentCount ? ` · ${version.documentCount} docs` : ''}
              </span>
            ))}
          </div>

          <div className="small text-secondary">
            {template.currentVersion
              ? `Documents are rendered with v${template.currentVersion}.`
              : 'No published version yet — publish one before making it the default.'}
          </div>
        </div>

        <div className="card-footer bg-white d-flex flex-wrap gap-2">
          <Link className="btn btn-sm btn-outline-primary" to={`/templates/${template.id}`}>
            {canManage ? (draft ? `Edit draft v${draft.version}` : 'Open') : 'Preview'}
          </Link>

          {canManage && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate()}
            >
              <Copy size={14} className="me-1" aria-hidden />
              Duplicate
            </button>
          )}

          {canPublish && !template.isDefault && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={defaultMutation.isPending || !template.currentVersion}
              title={
                template.currentVersion
                  ? 'Use this template on new documents'
                  : 'Publish a version first'
              }
              onClick={() => defaultMutation.mutate()}
            >
              <Star size={14} className="me-1" aria-hidden />
              Make default
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const TemplatesPage = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.TEMPLATE_UPDATE);
  const canCreate = hasPermission(PERMISSIONS.TEMPLATE_CREATE);
  const canPublish = hasPermission(PERMISSIONS.TEMPLATE_PUBLISH);

  const [tab, setTab] = useState<'INVOICE' | 'QUOTATION'>('INVOICE');
  const [newOpen, setNewOpen] = useState(false);

  const query = useQuery({
    queryKey: templateKeys.list(tab),
    queryFn: () => templatesApi.list(tab),
  });

  return (
    <>
      <PageHeader
        title="Templates"
        description="How documents look when they are rendered. A published version is never edited — editing creates the next one, so documents already issued keep their appearance."
        breadcrumbs={[{ label: 'Templates' }]}
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setNewOpen(true)}
            >
              <Plus size={15} className="me-1" aria-hidden />
              New template
            </button>
          ) : undefined
        }
      />

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${tab === 'INVOICE' ? ' active' : ''}`}
            onClick={() => setTab('INVOICE')}
          >
            <ReceiptText size={14} className="me-1" aria-hidden />
            Invoice
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${tab === 'QUOTATION' ? ' active' : ''}`}
            onClick={() => setTab('QUOTATION')}
          >
            <FileText size={14} className="me-1" aria-hidden />
            Quotation
          </button>
        </li>
      </ul>

      {query.isError && (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : 'Unexpected error.'}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isLoading && (
        <div className="row g-3">
          {[1, 2, 3].map((key) => (
            <div className="col-12 col-lg-6 col-xxl-4" key={key}>
              <div className="card">
                <div className="card-body placeholder-glow">
                  <span className="placeholder col-6 mb-2 d-block" />
                  <span className="placeholder col-9 d-block" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row g-3">
        {(query.data ?? []).map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            canManage={canManage}
            canPublish={canPublish}
          />
        ))}
      </div>

      <NewTemplateModal open={newOpen} docType={tab} onClose={() => setNewOpen(false)} />
    </>
  );
};
