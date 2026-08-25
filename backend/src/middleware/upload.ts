import multer from 'multer';
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@app/shared';
import { AppError } from '../utils/errors';
import { env } from '../config/env';

/**
 * Upload handling.
 *
 * Files are held in memory (they are small and capped) and validated three ways
 * before anything is written: declared MIME type, file extension, and the magic
 * bytes of the content itself. A .exe renamed to .png fails the third check.
 */

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  /** Normalised extension, including the dot, derived from the verified type. */
  extension: string;
}

interface TypeRule {
  mime: string;
  extensions: string[];
  /** Byte signature at offset 0 unless `offset` says otherwise. */
  magic?: { bytes: number[]; offset?: number }[];
}

const PNG: TypeRule = {
  mime: 'image/png',
  extensions: ['.png'],
  magic: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
};

const JPEG: TypeRule = {
  mime: 'image/jpeg',
  extensions: ['.jpg', '.jpeg'],
  magic: [{ bytes: [0xff, 0xd8, 0xff] }],
};

const SVG: TypeRule = { mime: 'image/svg+xml', extensions: ['.svg'] };

const PDF: TypeRule = {
  mime: 'application/pdf',
  extensions: ['.pdf'],
  magic: [{ bytes: [0x25, 0x50, 0x44, 0x46] }],
};

const DOCX: TypeRule = {
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extensions: ['.docx'],
  magic: [{ bytes: [0x50, 0x4b, 0x03, 0x04] }],
};

const XLSX: TypeRule = {
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extensions: ['.xlsx'],
  magic: [{ bytes: [0x50, 0x4b, 0x03, 0x04] }],
};

/** Decision Q12. */
export const IMAGE_RULES = [PNG, JPEG, SVG];
export const ATTACHMENT_RULES = [PDF, PNG, JPEG, DOCX, XLSX];

const matchesMagic = (buffer: Buffer, rule: TypeRule): boolean => {
  if (!rule.magic) return true; // SVG is text; handled by the sanitiser instead
  return rule.magic.some(({ bytes, offset = 0 }) =>
    bytes.every((byte, index) => buffer[offset + index] === byte),
  );
};

const extensionOf = (fileName: string): string => {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
};

/**
 * SVG is XML and can carry script, so it is sanitised rather than trusted.
 * Anything with a script element, an event handler or an external reference is
 * rejected outright — a logo has no business containing any of them.
 */
const assertSafeSvg = (buffer: Buffer): void => {
  const text = buffer.toString('utf8');

  if (!/<svg[\s>]/i.test(text)) {
    throw new AppError(ERROR_CODES.UNSUPPORTED_FILE_TYPE, 415, 'That file is not a valid SVG.');
  }

  const dangerous = [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /\son\w+\s*=/i, // onload, onclick, …
    /javascript:/i,
    /<!ENTITY/i, // XXE
    /<iframe[\s>]/i,
    /<embed[\s>]/i,
    /<use[^>]+href\s*=\s*["']?https?:/i,
  ];

  if (dangerous.some((pattern) => pattern.test(text))) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      415,
      'That SVG contains scripting or external references, so it cannot be used. Upload a PNG instead.',
    );
  }
};

export const validateUpload = (
  file: Express.Multer.File | undefined,
  rules: TypeRule[],
  maxMb: number,
): UploadedFile => {
  if (!file) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'No file was uploaded.');
  }

  if (file.size > maxMb * 1024 * 1024) {
    throw new AppError(
      ERROR_CODES.FILE_TOO_LARGE,
      413,
      // eslint-disable-next-line no-restricted-syntax -- a megabyte count for a message, not money
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${maxMb} MB.`,
    );
  }

  const extension = extensionOf(file.originalname);
  const allowed = rules.map((rule) => rule.extensions.join(', ')).join(', ');

  const rule = rules.find(
    (candidate) => candidate.mime === file.mimetype && candidate.extensions.includes(extension),
  );

  if (!rule) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      415,
      `That file type is not allowed. Accepted: ${allowed}.`,
    );
  }

  if (!matchesMagic(file.buffer, rule)) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      415,
      'The file contents do not match its extension, so it was rejected.',
    );
  }

  if (rule === SVG) assertSafeSvg(file.buffer);

  return {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: rule.mime,
    size: file.size,
    /* Normalise .jpeg → .jpg so keys stay predictable. */
    extension: extension === '.jpeg' ? '.jpg' : extension,
  };
};

/** Multer instance for a single file field, bounded generously; the real limit is
 *  enforced by validateUpload so the error message can be specific. */
export const singleFile = (field: string): RequestHandler =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.max(env.UPLOAD_MAX_MB, env.ATTACHMENT_MAX_MB) * 1024 * 1024,
      files: 1,
    },
  }).single(field);
