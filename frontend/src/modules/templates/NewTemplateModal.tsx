import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { templateKeys, templatesApi } from '@/services/templates-api';

/** Creating a template is picking a layout and naming it; the rest is the editor. */
export const NewTemplateModal = ({
  open,
  docType,
  onClose,
}: {
  open: boolean;
  docType: 'QUOTATION' | 'INVOICE';
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [engineKey, setEngineKey] = useState('corporate');

  const layouts = useQuery({
    queryKey: templateKeys.layouts(),
    queryFn: () => templatesApi.layouts(),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: () => templatesApi.create({ name: name.trim(), docType, engineKey }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      toast.success(`${created.name} created as a draft`);
      setName('');
      onClose();
      navigate(`/templates/${created.id}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not create the template.'),
  });

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim().length >= 2) mutation.mutate();
              }}
            >
              <div className="modal-header">
                <h2 className="modal-title h6">
                  New {docType === 'INVOICE' ? 'invoice' : 'quotation'} template
                </h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label" htmlFor="template-name">
                    Name
                  </label>
                  <input
                    id="template-name"
                    className="form-control"
                    autoFocus
                    required
                    minLength={2}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <fieldset>
                  <legend className="form-label">Layout</legend>
                  {(layouts.data ?? []).map((layout) => (
                    <div className="form-check mb-2" key={layout.key}>
                      <input
                        className="form-check-input"
                        type="radio"
                        name="engineKey"
                        id={`layout-${layout.key}`}
                        value={layout.key}
                        checked={engineKey === layout.key}
                        onChange={() => setEngineKey(layout.key)}
                      />
                      <label className="form-check-label" htmlFor={`layout-${layout.key}`}>
                        <span className="fw-medium">{layout.name}</span>
                        <div className="small text-secondary">{layout.description}</div>
                      </label>
                    </div>
                  ))}
                </fieldset>

                <p className="small text-secondary mb-0 mt-3">
                  It starts as a draft. Nothing renders with it until you publish a version.
                </p>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={mutation.isPending || name.trim().length < 2}
                >
                  {mutation.isPending ? 'Creating…' : 'Create and edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
};
