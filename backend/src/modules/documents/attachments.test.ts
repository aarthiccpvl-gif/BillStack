import { describe, expect, it } from 'vitest';
import { AppError } from '../../utils/errors';
import { ATTACHMENT_RULES, validateUpload } from '../../middleware/upload';
import { attachmentStorageKey, safeAttachmentFileName } from './attachments.service';

const upload = (name: string, mimetype: string, buffer: Buffer): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype,
    buffer,
    size: buffer.length,
  }) as Express.Multer.File;

const PDF = Buffer.from('%PDF-1.4\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

describe('attachment upload validation', () => {
  it('accepts the five document types the PRD allows', () => {
    const examples = [
      upload('signed-po.pdf', 'application/pdf', PDF),
      upload('site-photo.png', 'image/png', PNG),
      upload(
        'terms.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        DOCX,
      ),
      upload(
        'breakdown.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        DOCX,
      ),
    ];

    for (const file of examples) {
      expect(validateUpload(file, ATTACHMENT_RULES, 10).originalName).toBe(file.originalname);
    }
  });

  it('refuses an executable even when it is renamed', () => {
    const exe = upload('invoice.pdf', 'application/octet-stream', Buffer.from('MZ'));
    expect(() => validateUpload(exe, ATTACHMENT_RULES, 10)).toThrow(AppError);
  });

  it('refuses contents that do not match the extension', () => {
    const disguised = upload('invoice.pdf', 'application/pdf', PNG);
    expect(() => validateUpload(disguised, ATTACHMENT_RULES, 10)).toThrow(/contents do not match/i);
  });

  it('refuses a file above the configured limit', () => {
    const big = upload('big.pdf', 'application/pdf', Buffer.alloc(2048, 0x20));
    expect(() => validateUpload(big, ATTACHMENT_RULES, 0.001)).toThrow(/limit is/i);
  });
});

describe('attachment storage metadata', () => {
  it('generates a key under the owning document, never from the uploaded name', () => {
    const key = attachmentStorageKey('QUOTATION', 42n, '.pdf');
    expect(key).toMatch(/^documents\/quotations\/42\/attachments\/\d+-[0-9a-f-]+\.pdf$/);
  });

  it('keeps a display name readable without allowing path or header separators', () => {
    expect(safeAttachmentFileName('..\\signed "PO" 2026.pdf', '.pdf')).toBe(
      '.._signed _PO_ 2026.pdf',
    );
  });
});
