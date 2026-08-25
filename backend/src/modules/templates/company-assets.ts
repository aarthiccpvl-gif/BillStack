import type { DocumentAsset, DocumentData } from '@app/shared';
import { prisma } from '../../db/prisma';
import { getStorage } from '../../storage/storage.service';
import { logger } from '../../utils/logger';

/**
 * Company branding, inlined for rendering.
 *
 * Images become data: URIs so the rendered HTML makes no network requests — that
 * is what keeps a PDF identical every time and lets the renderer work with no
 * outbound access. A missing file degrades to "no image" rather than failing the
 * whole document: a logo that has been deleted should not stop an invoice printing.
 */

const MAX_INLINE_BYTES = 2 * 1024 * 1024;

const toDataUri = async (fileId: bigint | null): Promise<DocumentAsset | null> => {
  if (!fileId) return null;

  try {
    const file = await prisma.documentFile.findUnique({ where: { id: fileId } });
    if (!file) return null;

    if (file.sizeBytes > MAX_INLINE_BYTES) {
      logger.warn(
        { fileId: fileId.toString(), sizeBytes: file.sizeBytes },
        'branding image too large to inline; skipped',
      );
      return null;
    }

    const storage = getStorage();
    if (!(await storage.exists(file.storageKey))) return null;

    const buffer = await storage.get(file.storageKey);
    return { dataUri: `data:${file.mimeType};base64,${buffer.toString('base64')}` };
  } catch (error) {
    logger.warn({ err: error }, 'could not inline a branding image');
    return null;
  }
};

/** The company block for a rendered document, branding included. */
export const loadCompanyAssets = async (): Promise<Partial<DocumentData['company']>> => {
  const company = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!company) return {};

  const [logo, signature, seal] = await Promise.all([
    toDataUri(company.logoFileId),
    toDataUri(company.signatureFileId),
    toDataUri(company.sealFileId),
  ]);

  return {
    name: company.companyName,
    legalName: company.legalName,
    address: {
      line1: company.addressLine1,
      line2: company.addressLine2,
      city: company.city,
      state: company.state,
      stateCode: company.stateCode,
      country: company.country,
      postalCode: company.postalCode,
    },
    phone: company.phone,
    email: company.email,
    website: company.website,
    gstin: company.gstin,
    pan: company.pan,
    cin: company.cin,
    stateCode: company.stateCode,
    signatureLabel: company.signatureLabel,
    logo,
    signature,
    seal,
  };
};
