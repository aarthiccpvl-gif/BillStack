import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, MessageCircle, ShieldOff } from 'lucide-react';
import { PERMISSIONS } from '@app/shared';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/app/AuthProvider';
import { ApiError } from '@/services/api-client';
import { quotationKeys, quotationsApi } from '@/services/quotations-api';
import { formatDateTime } from '@/utils/format';

/**
 * Secure share links (decision Q9).
 *
 * A link is an opaque token that serves the PDF and nothing else — no session, no
 * account, no other document. It expires, it can be revoked, and every open is
 * counted, so "did the customer actually look at it?" has an answer.
 *
 * The WhatsApp button is a plain wa.me deep link the user sends themselves; no
 * WhatsApp Business API is involved (decision Q14).
 */

const EXPIRY_CHOICES = [7, 14, 30, 60, 90] as const;

export const ShareLinksPanel = ({ quotationId }: { quotationId: string }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canShare = hasPermission(PERMISSIONS.QUOTATION_SHARE);

  const [expiresInDays, setExpiresInDays] = useState<number>(30);

  const linksQuery = useQuery({
    queryKey: quotationKeys.shares(quotationId),
    queryFn: () => quotationsApi.shareLinks(quotationId),
  });

  const copy = async (url: string, message: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(message);
    } catch {
      /* Clipboard access can be refused; the link is on screen either way. */
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  const createMutation = useMutation({
    mutationFn: () => quotationsApi.createShareLink(quotationId, expiresInDays),
    onSuccess: async (link) => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.shares(quotationId) });
      await copy(link.url, 'Link created and copied');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not create a link.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) => quotationsApi.revokeShareLink(quotationId, shareId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: quotationKeys.shares(quotationId) });
      toast.success('Link revoked — it stops working immediately');
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not revoke the link.'),
  });

  const links = linksQuery.data ?? [];
  const active = links.filter((link) => !link.revokedAt);

  return (
    <div className="card">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="label-caps">Share links</span>
        {active.length > 0 && <span className="badge text-bg-light border">{active.length}</span>}
      </div>

      <div className="card-body">
        {canShare && (
          <div className="d-flex gap-2 align-items-end mb-3">
            <div className="flex-grow-1">
              <label className="form-label small text-secondary mb-1" htmlFor="share-expiry">
                Expires in
              </label>
              <select
                id="share-expiry"
                className="form-select form-select-sm"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
              >
                {EXPIRY_CHOICES.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Link2 size={14} className="me-1" aria-hidden />
              {createMutation.isPending ? 'Creating…' : 'Create link'}
            </button>
          </div>
        )}

        {links.length === 0 && (
          <p className="small text-secondary mb-0">
            No link has been created yet. A link serves the PDF only, expires on its own and can be
            revoked at any time.
          </p>
        )}

        <ul className="list-unstyled mb-0">
          {links.map((link) => {
            const revoked = Boolean(link.revokedAt);
            const expired = Boolean(link.expiresAt && new Date(link.expiresAt) < new Date());

            return (
              <li key={link.id} className="border-top py-2">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="text-mono small text-truncate"
                      style={{ maxWidth: '20rem' }}
                      title={link.url}
                    >
                      {link.url}
                    </div>
                    <div className="small text-secondary">
                      {revoked
                        ? `Revoked ${formatDateTime(link.revokedAt)}`
                        : expired
                          ? `Expired ${formatDateTime(link.expiresAt)}`
                          : link.expiresAt
                            ? `Valid until ${formatDateTime(link.expiresAt)}`
                            : 'No expiry'}
                      {' · '}
                      {link.viewCount === 0
                        ? 'Not opened yet'
                        : `Opened ${link.viewCount}×, last ${formatDateTime(link.lastViewedAt)}`}
                    </div>
                  </div>

                  <div className="btn-group btn-group-sm flex-shrink-0">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="Copy link"
                      disabled={revoked}
                      onClick={() => void copy(link.url, 'Link copied')}
                    >
                      <Copy size={13} aria-hidden />
                      <span className="visually-hidden">Copy this link</span>
                    </button>
                    <a
                      className={`btn btn-outline-secondary${revoked ? ' disabled' : ''}`}
                      href={link.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send on WhatsApp"
                    >
                      <MessageCircle size={13} aria-hidden />
                      <span className="visually-hidden">Send this link on WhatsApp</span>
                    </a>
                    {canShare && !revoked && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        title="Revoke"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(link.id)}
                      >
                        <ShieldOff size={13} aria-hidden />
                        <span className="visually-hidden">Revoke this link</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
