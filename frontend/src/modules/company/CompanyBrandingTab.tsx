import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import type { CompanyAssetRef, CompanySettingsRecord } from '@app/shared';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/services/api-client';
import { companyApi, companyKeys } from '@/services/masters-api';

type AssetKind = 'logo' | 'favicon' | 'signature' | 'seal';

const ASSETS: {
  kind: AssetKind;
  label: string;
  description: string;
  height: number;
}[] = [
  {
    kind: 'logo',
    label: 'Company logo',
    description: 'Printed at the top of every document. PNG or JPG up to 5 MB; SVG also accepted.',
    height: 64,
  },
  {
    kind: 'signature',
    label: 'Authorised signature',
    description: 'Appears above the signatory name in the signature area of a document.',
    height: 56,
  },
  {
    kind: 'seal',
    label: 'Company seal / stamp',
    description: 'Printed beside the signature. Shown or hidden per template.',
    height: 72,
  },
  {
    kind: 'favicon',
    label: 'Favicon',
    description: 'Browser tab icon for this application.',
    height: 32,
  },
];

const AssetSlot = ({
  kind,
  label,
  description,
  height,
  asset,
  canEdit,
}: {
  kind: AssetKind;
  label: string;
  description: string;
  height: number;
  asset: CompanyAssetRef | null;
  canEdit: boolean;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onSuccess = (updated: CompanySettingsRecord, message: string) => {
    queryClient.setQueryData(companyKeys.settings(), updated);
    toast.success(message);
  };

  const onError = (error: unknown, fallback: string) => {
    toast.error(error instanceof ApiError ? error.message : fallback);
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      onSuccess(await companyApi.uploadAsset(kind, file), `${label} updated`);
    } catch (error) {
      onError(error, `Could not upload the ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      onSuccess(await companyApi.removeAsset(kind), `${label} removed`);
    } catch (error) {
      onError(error, `Could not remove the ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col-12 col-lg-6">
      <div className="card h-100">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
            <div>
              <div className="fw-medium">{label}</div>
              <div className="small text-secondary">{description}</div>
            </div>
          </div>

          <div
            className="d-flex align-items-center justify-content-center border rounded bg-body-tertiary mb-3"
            style={{ minHeight: `${height + 24}px` }}
          >
            {asset ? (
              <img
                src={asset.url}
                alt={label}
                style={{ maxHeight: height, maxWidth: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span className="small text-secondary py-3">Nothing uploaded</span>
            )}
          </div>

          {canEdit && (
            <div className="d-flex gap-2">
              <input
                ref={inputRef}
                type="file"
                className="d-none"
                accept="image/png,image/jpeg,image/svg+xml"
                aria-label={`Upload ${label}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload size={14} className="me-1" aria-hidden />
                {asset ? 'Replace' : 'Upload'}
              </button>
              {asset && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 size={14} className="me-1" aria-hidden />
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Branding.
 *
 * Replacing an image never overwrites the stored bytes — keys are timestamped —
 * so a PDF generated last month still renders with the logo it was issued with.
 */
export const CompanyBrandingTab = ({
  company,
  canEdit,
}: {
  company: CompanySettingsRecord;
  canEdit: boolean;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [primary, setPrimary] = useState(company.primaryColor);
  const [secondary, setSecondary] = useState(company.secondaryColor);
  const [signatureLabel, setSignatureLabel] = useState(company.signatureLabel ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      companyApi.update({
        primaryColor: primary,
        secondaryColor: secondary,
        signatureLabel,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(companyKeys.settings(), updated);
      toast.success('Branding saved');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the branding.'),
  });

  return (
    <>
      <div className="row g-3 mb-3">
        {ASSETS.map((asset) => (
          <AssetSlot key={asset.kind} {...asset} asset={company[asset.kind]} canEdit={canEdit} />
        ))}
      </div>

      <div className="card">
        <div className="card-header bg-white">
          <span className="label-caps">Colours and signature label</span>
        </div>
        <div className="card-body">
          <div className="row align-items-end">
            <div className="col-md-3 mb-3">
              <label className="form-label" htmlFor="primaryColor">
                Primary colour
              </label>
              <div className="input-group">
                <input
                  type="color"
                  className="form-control form-control-color"
                  id="primaryColor"
                  value={primary}
                  disabled={!canEdit}
                  onChange={(event) => setPrimary(event.target.value)}
                />
                <input
                  className="form-control text-mono"
                  value={primary}
                  disabled={!canEdit}
                  aria-label="Primary colour hex value"
                  onChange={(event) => setPrimary(event.target.value)}
                />
              </div>
            </div>

            <div className="col-md-3 mb-3">
              <label className="form-label" htmlFor="secondaryColor">
                Secondary colour
              </label>
              <div className="input-group">
                <input
                  type="color"
                  className="form-control form-control-color"
                  id="secondaryColor"
                  value={secondary}
                  disabled={!canEdit}
                  onChange={(event) => setSecondary(event.target.value)}
                />
                <input
                  className="form-control text-mono"
                  value={secondary}
                  disabled={!canEdit}
                  aria-label="Secondary colour hex value"
                  onChange={(event) => setSecondary(event.target.value)}
                />
              </div>
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label" htmlFor="signatureLabel">
                Signature label
              </label>
              <input
                id="signatureLabel"
                className="form-control"
                placeholder="For Five2 Digitals — Authorised Signatory"
                value={signatureLabel}
                disabled={!canEdit}
                onChange={(event) => setSignatureLabel(event.target.value)}
              />
            </div>
          </div>

          <div className="small text-secondary">
            These colours are used by the document templates. The application chrome keeps its own
            palette so a bright brand colour cannot make the interface hard to read.
          </div>
        </div>

        {canEdit && (
          <div className="card-footer bg-white d-flex justify-content-end">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};
