import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileDown, Lock, RefreshCw, Save } from 'lucide-react';
import { PERMISSIONS, templateConfigSchema, type TemplateConfig } from '@app/shared';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { templateKeys, templatesApi } from '@/services/templates-api';
import { TemplateConfigForm } from './TemplateConfigForm';

/**
 * The template editor: configuration on the left, live document preview on the right.
 *
 * The preview is not an approximation — it is the *actual* renderer output for the
 * config currently on screen, fetched from the same endpoint the PDF pipeline uses.
 * That is why what you see here is what the customer receives.
 */
export const TemplateEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const templateId = Number(id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const canEdit = hasPermission(PERMISSIONS.TEMPLATE_UPDATE);
  const canPublish = hasPermission(PERMISSIONS.TEMPLATE_PUBLISH);

  const [config, setConfig] = useState<TemplateConfig | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lineCount, setLineCount] = useState(4);
  const abortRef = useRef<AbortController | null>(null);

  const templateQuery = useQuery({
    queryKey: templateKeys.detail(templateId),
    queryFn: () => templatesApi.get(templateId),
    enabled: Number.isFinite(templateId),
  });

  const template = templateQuery.data;

  /* Edit the draft if there is one; otherwise show the published version read-only. */
  const editableVersion = useMemo(
    () => template?.versions.find((version) => version.status === 'DRAFT'),
    [template],
  );
  const displayVersion = useMemo(
    () =>
      editableVersion ??
      template?.versions.find((version) => version.status === 'PUBLISHED') ??
      template?.versions[0],
    [template, editableVersion],
  );

  const configQuery = useQuery({
    queryKey: templateKeys.config(templateId, displayVersion?.version ?? 0),
    queryFn: () => templatesApi.versionConfig(templateId, displayVersion?.version ?? 1),
    enabled: Boolean(displayVersion),
  });

  useEffect(() => {
    if (configQuery.data) {
      setConfig(configQuery.data);
      setDirty(false);
    }
  }, [configQuery.data]);

  const isDraft = displayVersion?.status === 'DRAFT';
  const readOnly = !canEdit || !isDraft;

  /* --- live preview: debounced, cancellable, and always the real renderer --- */
  const refreshPreview = useCallback(
    async (next: TemplateConfig) => {
      if (!template) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPreviewing(true);
      try {
        const html = await templatesApi.previewHtml({
          docType: template.docType,
          engineKey: template.engineKey,
          config: next,
          lineCount,
        });
        if (!controller.signal.aborted) setPreviewHtml(html);
      } catch (error) {
        if (!controller.signal.aborted) {
          /* An invalid config is the common case here — the panel already shows why. */
          if (!(error instanceof ApiError) || error.status !== 422) {
            toast.error(
              error instanceof ApiError ? error.message : 'Could not refresh the preview.',
            );
          }
        }
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    },
    [template, lineCount, toast],
  );

  useEffect(() => {
    if (!config || !template) return;
    const timer = window.setTimeout(() => void refreshPreview(config), 400);
    return () => window.clearTimeout(timer);
  }, [config, template, refreshPreview]);

  const validation = config ? templateConfigSchema.safeParse(config) : null;
  const configValid = validation?.success ?? false;

  const saveMutation = useMutation({
    mutationFn: () =>
      templatesApi.saveConfig(templateId, displayVersion?.version ?? 1, config as TemplateConfig),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      setDirty(false);
      toast.success('Draft saved');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the template.'),
  });

  const draftMutation = useMutation({
    mutationFn: () => templatesApi.createDraft(templateId),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      const draft = updated.versions.find((version) => version.status === 'DRAFT');
      toast.success(`Draft v${draft?.version ?? ''} created — published versions stay untouched`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not create a draft.'),
  });

  const publishMutation = useMutation({
    mutationFn: () => templatesApi.publish(templateId, displayVersion?.version ?? 1),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      toast.success('Version published — new documents will use it');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not publish.'),
  });

  const downloadPdf = async () => {
    if (!template || !config) return;
    try {
      const url = await templatesApi.previewPdfUrl({
        docType: template.docType,
        engineKey: template.engineKey,
        config,
        lineCount,
      });
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not render the PDF.');
    }
  };

  if (templateQuery.isError) {
    return (
      <ErrorState
        message={
          templateQuery.error instanceof ApiError
            ? templateQuery.error.message
            : 'Unexpected error.'
        }
        onRetry={() => void templateQuery.refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={template?.name ?? 'Template'}
        description={
          template
            ? `${template.docType === 'INVOICE' ? 'Invoice' : 'Quotation'} · ${template.engineKey} layout${displayVersion ? ` · v${displayVersion.version} ${displayVersion.status.toLowerCase()}` : ''}`
            : undefined
        }
        breadcrumbs={[{ label: 'Templates', to: '/templates' }, { label: template?.name ?? '' }]}
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void downloadPdf()}
            >
              <FileDown size={14} className="me-1" aria-hidden />
              PDF
            </button>

            {canEdit && !isDraft && (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={draftMutation.isPending}
                onClick={() => draftMutation.mutate()}
              >
                Create draft to edit
              </button>
            )}

            {canEdit && isDraft && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!dirty || !configValid || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Save size={14} className="me-1" aria-hidden />
                {saveMutation.isPending ? 'Saving…' : 'Save draft'}
              </button>
            )}

            {canPublish && isDraft && (
              <button
                type="button"
                className="btn btn-sm btn-success"
                disabled={dirty || !configValid || publishMutation.isPending}
                title={dirty ? 'Save the draft before publishing' : 'Publish this version'}
                onClick={() => publishMutation.mutate()}
              >
                <CheckCircle2 size={14} className="me-1" aria-hidden />
                Publish
              </button>
            )}
          </>
        }
      />

      {!isDraft && displayVersion && (
        <div className="alert alert-light border d-flex align-items-start gap-2 py-2 small">
          <Lock size={15} className="flex-shrink-0 mt-1" aria-hidden />
          <div>
            Version {displayVersion.version} is published and cannot be changed
            {displayVersion.documentCount
              ? ` — ${displayVersion.documentCount} document(s) were rendered with it and must keep looking the same.`
              : '.'}{' '}
            {canEdit && 'Create a draft to make changes; the published version stays as it is.'}
          </div>
        </div>
      )}

      {validation && !validation.success && (
        <div className="alert alert-warning py-2 small" role="alert">
          {validation.error.issues[0]?.message ?? 'This configuration is not valid.'}
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xl-5">
          {config && (
            <TemplateConfigForm
              config={config}
              disabled={readOnly}
              onChange={(next) => {
                setConfig(next);
                setDirty(true);
              }}
            />
          )}
        </div>

        <div className="col-12 col-xl-7">
          <div className="card position-sticky" style={{ top: '4.5rem' }}>
            <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="label-caps">
                Live preview
                {previewing && <RefreshCw size={12} className="ms-2 text-secondary" aria-hidden />}
              </span>

              <div className="d-flex align-items-center gap-2">
                <label className="small text-secondary mb-0" htmlFor="line-count">
                  Sample lines
                </label>
                <select
                  id="line-count"
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={lineCount}
                  onChange={(event) => setLineCount(Number(event.target.value))}
                >
                  <option value={1}>1</option>
                  <option value={4}>4</option>
                  <option value={12}>12</option>
                  <option value={45}>45 (multi-page)</option>
                </select>
              </div>
            </div>

            <div className="card-body p-0" style={{ background: '#f1f3f5' }}>
              {previewHtml ? (
                <iframe
                  title="Document preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  style={{
                    width: '210mm',
                    height: '297mm',
                    border: 0,
                    background: '#fff',
                    /* A4 scaled to fit the panel; the content is the real thing. */
                    transform: 'scale(0.62)',
                    transformOrigin: 'top left',
                    display: 'block',
                  }}
                />
              ) : (
                <div className="p-5 text-center text-secondary small">Rendering preview…</div>
              )}
            </div>

            <div className="card-footer bg-white small text-secondary">
              This is the actual renderer output — the PDF is produced from exactly this HTML.
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
