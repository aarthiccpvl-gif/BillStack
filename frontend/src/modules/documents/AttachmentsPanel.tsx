import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { PERMISSIONS, type DocumentAttachmentRecord, type Permission } from '@app/shared';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { formatDateTime, saveBlob } from '@/utils/format';

export interface AttachmentsApi {
  attachments: (id: string) => Promise<DocumentAttachmentRecord[]>;
  uploadAttachment: (id: string, file: File) => Promise<DocumentAttachmentRecord>;
  deleteAttachment: (id: string, fileId: string) => Promise<unknown>;
  downloadAttachment: (
    id: string,
    fileId: string,
  ) => Promise<{ blob: Blob; fileName: string | null }>;
}

/** Matches ATTACHMENT_RULES on the server; the API enforces it either way. */
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx';
const MAX_MB = 10;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Supporting documents on a quotation or invoice.
 *
 * A Finance Viewer sees the files but is offered no upload or remove control —
 * and the API refuses the write as well, so hiding the button is not the guard.
 * The original file name is shown; the storage key never uses it.
 */
export const AttachmentsPanel = ({
  documentId,
  api,
  attachmentsKey,
  writePermission = PERMISSIONS.QUOTATION_UPDATE,
}: {
  documentId: string;
  api: AttachmentsApi;
  attachmentsKey: readonly unknown[];
  writePermission?: Permission;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(writePermission);
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: attachmentsKey,
    queryFn: () => api.attachments(documentId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(documentId, file),
    onSuccess: async (attachment) => {
      await queryClient.invalidateQueries({ queryKey: attachmentsKey });
      toast.success(`${attachment.fileName} attached`);
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (error: unknown) => {
      if (inputRef.current) inputRef.current.value = '';
      toast.error(error instanceof ApiError ? error.message : 'The file could not be attached.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.deleteAttachment(documentId, fileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: attachmentsKey });
      toast.success('Attachment removed — the document itself is unchanged');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not remove the file.'),
  });

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`That file is larger than the ${MAX_MB} MB limit.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    uploadMutation.mutate(file);
  };

  const download = async (attachment: DocumentAttachmentRecord) => {
    setDownloadingId(attachment.id);
    try {
      const { blob, fileName } = await api.downloadAttachment(documentId, attachment.id);
      saveBlob(blob, fileName ?? attachment.fileName);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not download the file.');
    } finally {
      setDownloadingId(null);
    }
  };

  const attachments = query.data ?? [];

  return (
    <div className="card mb-3">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">Attachments</span>
        {attachments.length > 0 && (
          <span className="badge text-bg-light border">{attachments.length}</span>
        )}
      </div>

      <div className="card-body">
        {canWrite && (
          <div className="mb-3">
            <input
              ref={inputRef}
              id={`attachments-${documentId}`}
              type="file"
              className="d-none"
              accept={ACCEPT}
              onChange={(event) => onFileChosen(event.target.files?.[0])}
            />
            <label
              htmlFor={`attachments-${documentId}`}
              className={`btn btn-sm btn-outline-secondary mb-0${uploadMutation.isPending ? ' disabled' : ''}`}
            >
              <Upload size={14} className="me-1" aria-hidden />
              {uploadMutation.isPending ? 'Uploading…' : 'Attach a file'}
            </label>
            <div className="small text-secondary mt-1">
              PDF, PNG, JPG, DOCX or XLSX · up to {MAX_MB} MB.
            </div>
          </div>
        )}

        {query.isLoading && <div className="small text-secondary">Loading…</div>}

        {query.isError && (
          <div className="alert alert-danger py-2 small mb-0" role="alert">
            {query.error instanceof ApiError
              ? query.error.message
              : 'Could not load the attachments.'}
          </div>
        )}

        {!query.isLoading && !query.isError && attachments.length === 0 && (
          <div className="text-secondary small">
            <Paperclip size={14} className="me-1" aria-hidden />
            No supporting files{canWrite ? ' yet' : ''}.
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="list-group list-group-flush">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="list-group-item px-0 d-flex align-items-start gap-2"
              >
                <FileText size={16} className="mt-1 text-secondary" aria-hidden />
                <div className="flex-grow-1 min-w-0">
                  <div className="text-truncate">{attachment.fileName}</div>
                  <div className="small text-secondary">
                    {formatBytes(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}
                    {attachment.createdByName ? ` · ${attachment.createdByName}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  aria-label={`Download ${attachment.fileName}`}
                  disabled={downloadingId === attachment.id}
                  onClick={() => void download(attachment)}
                >
                  <Download size={14} aria-hidden />
                </button>
                {canWrite && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    aria-label={`Remove ${attachment.fileName}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${attachment.fileName}? This deletes the file, not the document.`,
                        )
                      ) {
                        deleteMutation.mutate(attachment.id);
                      }
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
