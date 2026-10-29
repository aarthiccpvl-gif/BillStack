import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DocumentAttachmentRecord } from '@app/shared';
import { AppProviders } from '@/app/providers';
import { buildUser, mockApi } from '@/test/harness';
import { AttachmentsPanel, type AttachmentsApi } from './AttachmentsPanel';

const ATTACHMENT: DocumentAttachmentRecord = {
  id: '12',
  fileName: 'signed-po.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 245_760,
  checksumSha256: null,
  createdAt: '2026-10-29T09:15:00.000Z',
  createdByName: 'Alex Admin',
};

const apiWith = (rows: DocumentAttachmentRecord[]): AttachmentsApi => ({
  attachments: vi.fn().mockResolvedValue(rows),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
});

const renderPanel = (role: 'ADMIN' | 'FINANCE_VIEWER', api: AttachmentsApi) => {
  mockApi(buildUser(role));
  render(
    <AppProviders>
      <AttachmentsPanel documentId="7" api={api} attachmentsKey={['attachments', '7']} />
    </AppProviders>,
  );
};

describe('document attachments', () => {
  it('lists a file with a download control for someone who may update the document', async () => {
    renderPanel('ADMIN', apiWith([ATTACHMENT]));

    expect(await screen.findByText('signed-po.pdf')).toBeInTheDocument();
    expect(screen.getByText(/240\.0 KB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download signed-po.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove signed-po.pdf' })).toBeInTheDocument();
    expect(screen.getByLabelText('Attach a file')).toBeInTheDocument();
  });

  it('lets a Finance Viewer read and download but offers no write control', async () => {
    renderPanel('FINANCE_VIEWER', apiWith([ATTACHMENT]));

    expect(await screen.findByText('signed-po.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download signed-po.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove signed-po.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Attach a file')).not.toBeInTheDocument();
  });

  it('says plainly when there is nothing attached', async () => {
    renderPanel('ADMIN', apiWith([]));

    expect(await screen.findByText(/no supporting files yet/i)).toBeInTheDocument();
  });
});
