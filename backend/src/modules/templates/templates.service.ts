import type { Prisma } from '@prisma/client';
import {
  defaultTemplateConfig,
  parseTemplateConfig,
  templateConfigSchema,
  type DocumentData,
  type TemplateConfig,
  type TemplateRecord,
} from '@app/shared';
import { prisma } from '../../db/prisma';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/errors';
import { ImmutableResourceError } from '../../utils/errors';
import { recordAudit } from '../../services/audit.service';
import { getLayout, layoutKeys } from '../../render/registry';
import { buildPageFurniture, renderDocumentHtml } from '../../render/render.service';
import { buildSampleDocument } from '../../render/sample-data';
import { renderPdf } from '../../pdf/pdf.service';
import { loadCompanyAssets } from './company-assets';

/**
 * Templates and their versions.
 *
 * The rule that makes historical documents trustworthy: a PUBLISHED version is
 * immutable. Editing one clones it to version n+1, and every document stores the
 * `templateVersionId` it was rendered with — so re-downloading a 2026 invoice in
 * 2029 reproduces exactly what the customer received.
 */

const templateInclude = {
  versions: { orderBy: { version: 'desc' } },
} satisfies Prisma.TemplateInclude;

type TemplateWithVersions = Prisma.TemplateGetPayload<{ include: typeof templateInclude }>;

const toRecord = async (template: TemplateWithVersions): Promise<TemplateRecord> => {
  const versionIds = template.versions.map((version) => version.id);

  /* How many documents each version has rendered — an edited version would change
     what those documents look like, which is why it is blocked. */
  const [quotationCounts, invoiceCounts] = await Promise.all([
    prisma.quotation.groupBy({
      by: ['templateVersionId'],
      where: { templateVersionId: { in: versionIds } },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['templateVersionId'],
      where: { templateVersionId: { in: versionIds } },
      _count: { _all: true },
    }),
  ]);

  const usage = new Map<number, number>();
  for (const row of [...quotationCounts, ...invoiceCounts]) {
    usage.set(row.templateVersionId, (usage.get(row.templateVersionId) ?? 0) + row._count._all);
  }

  const published = template.versions.filter((version) => version.status === 'PUBLISHED');

  return {
    id: template.id,
    key: template.key,
    name: template.name,
    docType: template.docType as 'QUOTATION' | 'INVOICE',
    engineKey: template.engineKey,
    description: template.description,
    isDefault: template.isDefault,
    status: template.status,
    currentVersion: published[0]?.version ?? null,
    versions: template.versions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      changeNote: version.changeNote,
      publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
      createdAt: version.createdAt.toISOString(),
      documentCount: usage.get(version.id) ?? 0,
    })),
  };
};

export const listTemplates = async (docType?: 'QUOTATION' | 'INVOICE') => {
  const templates = await prisma.template.findMany({
    where: { status: { not: 'ARCHIVED' }, ...(docType ? { docType } : {}) },
    include: templateInclude,
    orderBy: [{ docType: 'asc' }, { name: 'asc' }],
  });

  return Promise.all(templates.map(toRecord));
};

export const getTemplate = async (id: number): Promise<TemplateRecord> => {
  const template = await prisma.template.findUnique({ where: { id }, include: templateInclude });
  if (!template) throw new NotFoundError('Template');
  return toRecord(template);
};

export const getVersionConfig = async (
  templateId: number,
  version: number,
): Promise<TemplateConfig> => {
  const row = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
    include: { template: true },
  });
  if (!row) throw new NotFoundError('Template version');
  return parseTemplateConfig(
    row.configJson,
    row.template.docType === 'INVOICE' ? 'INVOICE' : 'QUOTATION',
  );
};

export const createTemplate = async (
  input: {
    name: string;
    docType: 'QUOTATION' | 'INVOICE';
    engineKey: string;
    description?: string | null;
  },
  actorId: number,
): Promise<TemplateRecord> => {
  if (!layoutKeys.includes(input.engineKey)) {
    throw new BusinessRuleError(`Unknown layout "${input.engineKey}".`);
  }

  const key = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const existing = await prisma.template.findUnique({
    where: { key_docType: { key, docType: input.docType } },
  });
  if (existing) throw new ConflictError('A template with that name already exists for this type.');

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.template.create({
      data: {
        key,
        name: input.name,
        docType: input.docType,
        engineKey: input.engineKey,
        description: input.description ?? null,
        createdById: actorId,
        versions: {
          create: {
            version: 1,
            configJson: defaultTemplateConfig(
              input.docType === 'INVOICE' ? 'INVOICE' : 'QUOTATION',
            ) as unknown as Prisma.InputJsonValue,
            status: 'DRAFT',
            createdById: actorId,
          },
        },
      },
      include: templateInclude,
    });

    await recordAudit(
      {
        action: 'TEMPLATE_CREATED',
        entityType: 'TEMPLATE',
        entityId: template.id,
        entityLabel: `${template.name} (${template.docType})`,
        newData: { name: template.name, engineKey: template.engineKey },
      },
      tx,
    );

    return template;
  });

  return toRecord(created);
};

export const duplicateTemplate = async (id: number, actorId: number): Promise<TemplateRecord> => {
  const source = await prisma.template.findUnique({ where: { id }, include: templateInclude });
  if (!source) throw new NotFoundError('Template');

  const published = source.versions.find((version) => version.status === 'PUBLISHED');
  const config = published?.configJson ?? source.versions[0]?.configJson;

  let name = `${source.name} copy`;
  let key = `${source.key}-copy`;
  let suffix = 2;
  while (
    await prisma.template.findUnique({ where: { key_docType: { key, docType: source.docType } } })
  ) {
    name = `${source.name} copy ${suffix}`;
    key = `${source.key}-copy-${suffix}`;
    suffix += 1;
  }

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.template.create({
      data: {
        key,
        name,
        docType: source.docType,
        engineKey: source.engineKey,
        description: source.description,
        createdById: actorId,
        versions: {
          create: {
            version: 1,
            configJson: (config ?? {}) as Prisma.InputJsonValue,
            status: 'DRAFT',
            changeNote: `Duplicated from ${source.name}`,
            createdById: actorId,
          },
        },
      },
      include: templateInclude,
    });

    await recordAudit(
      {
        action: 'TEMPLATE_CREATED',
        entityType: 'TEMPLATE',
        entityId: template.id,
        entityLabel: template.name,
        metadata: { duplicatedFrom: source.name },
      },
      tx,
    );

    return template;
  });

  return toRecord(created);
};

export const setDefaultTemplate = async (id: number): Promise<TemplateRecord> => {
  const template = await prisma.template.findUnique({ where: { id }, include: templateInclude });
  if (!template) throw new NotFoundError('Template');

  const hasPublished = template.versions.some((version) => version.status === 'PUBLISHED');
  if (!hasPublished) {
    throw new BusinessRuleError(
      'Publish a version before making this the default — new documents need something to render with.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.template.updateMany({
      where: { docType: template.docType },
      data: { isDefault: false },
    });
    await tx.template.update({ where: { id }, data: { isDefault: true } });

    await tx.companySettings.update({
      where: { id: 1 },
      data:
        template.docType === 'INVOICE'
          ? { defaultInvoiceTemplateId: id }
          : { defaultQuotationTemplateId: id },
    });

    await recordAudit(
      {
        action: 'TEMPLATE_DEFAULT_CHANGED',
        entityType: 'TEMPLATE',
        entityId: id,
        entityLabel: `${template.name} (${template.docType})`,
      },
      tx,
    );
  });

  return getTemplate(id);
};

/**
 * Saves a draft version's config.
 *
 * A PUBLISHED version is never edited — the caller is expected to have created a
 * new draft first (`createDraftVersion`), which is what the UI's "Edit" does.
 */
export const updateVersionConfig = async (
  templateId: number,
  version: number,
  config: unknown,
): Promise<TemplateRecord> => {
  const row = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
    include: { template: true },
  });
  if (!row) throw new NotFoundError('Template version');

  if (row.status !== 'DRAFT') {
    throw new ImmutableResourceError(
      `Version ${version} is published and cannot be changed. Create a new draft version instead — documents already rendered with it must keep looking the same.`,
    );
  }

  const parsed = templateConfigSchema.parse(config);

  await prisma.$transaction(async (tx) => {
    await tx.templateVersion.update({
      where: { id: row.id },
      data: { configJson: parsed as unknown as Prisma.InputJsonValue },
    });

    await recordAudit(
      {
        action: 'TEMPLATE_UPDATED',
        entityType: 'TEMPLATE',
        entityId: templateId,
        entityLabel: `${row.template.name} v${version}`,
      },
      tx,
    );
  });

  return getTemplate(templateId);
};

export const createDraftVersion = async (
  templateId: number,
  actorId: number,
  changeNote?: string | null,
): Promise<TemplateRecord> => {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: templateInclude,
  });
  if (!template) throw new NotFoundError('Template');

  const existingDraft = template.versions.find((version) => version.status === 'DRAFT');
  if (existingDraft) {
    throw new BusinessRuleError(
      `Version ${existingDraft.version} is already a draft. Publish or continue editing it rather than starting another.`,
    );
  }

  const latest = template.versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.templateVersion.create({
      data: {
        templateId,
        version: nextVersion,
        /* Starts as a copy of the newest version, so editing continues from what
           is currently in use rather than from defaults. */
        configJson: (latest?.configJson ?? {}) as Prisma.InputJsonValue,
        status: 'DRAFT',
        changeNote: changeNote ?? null,
        createdById: actorId,
      },
    });

    await recordAudit(
      {
        action: 'TEMPLATE_UPDATED',
        entityType: 'TEMPLATE',
        entityId: templateId,
        entityLabel: `${template.name} — draft v${nextVersion} created`,
      },
      tx,
    );
  });

  return getTemplate(templateId);
};

export const publishVersion = async (
  templateId: number,
  version: number,
): Promise<TemplateRecord> => {
  const row = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
    include: { template: true },
  });
  if (!row) throw new NotFoundError('Template version');
  if (row.status === 'PUBLISHED') return getTemplate(templateId);

  /* Refuse to publish something that cannot render. */
  templateConfigSchema.parse(row.configJson);

  await prisma.$transaction(async (tx) => {
    /* Older published versions are archived, not deleted: the documents that used
       them still need to re-render exactly as issued. */
    await tx.templateVersion.updateMany({
      where: { templateId, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });

    await tx.templateVersion.update({
      where: { id: row.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await recordAudit(
      {
        action: 'TEMPLATE_VERSION_PUBLISHED',
        entityType: 'TEMPLATE',
        entityId: templateId,
        entityLabel: `${row.template.name} v${version}`,
      },
      tx,
    );
  });

  return getTemplate(templateId);
};

// ------------------------------------------------------------- previewing ---

export interface PreviewInput {
  /** Preview a stored version… */
  templateId?: number;
  version?: number;
  /** …or an unsaved config from the editor. */
  engineKey?: string;
  config?: unknown;
  docType: 'QUOTATION' | 'INVOICE';
  /** Raise to check page breaks. */
  lineCount?: number;
}

const resolvePreview = async (
  input: PreviewInput,
): Promise<{ config: TemplateConfig; engineKey: string; data: DocumentData }> => {
  let config: TemplateConfig;
  let engineKey = input.engineKey ?? 'corporate';

  if (input.config !== undefined) {
    config = templateConfigSchema.parse(input.config);
  } else if (input.templateId) {
    const template = await prisma.template.findUnique({
      where: { id: input.templateId },
      include: templateInclude,
    });
    if (!template) throw new NotFoundError('Template');

    engineKey = template.engineKey;
    const version =
      input.version === undefined
        ? (template.versions.find((entry) => entry.status === 'PUBLISHED') ?? template.versions[0])
        : template.versions.find((entry) => entry.version === input.version);

    if (!version) throw new NotFoundError('Template version');
    config = parseTemplateConfig(
      version.configJson,
      template.docType === 'INVOICE' ? 'INVOICE' : 'QUOTATION',
    );
  } else {
    config = defaultTemplateConfig(input.docType === 'INVOICE' ? 'INVOICE' : 'QUOTATION');
  }

  /* Real branding, sample figures — so the preview shows the actual logo, seal and
     signature rather than placeholders. */
  const assets = await loadCompanyAssets();
  const data = buildSampleDocument({
    docType: input.docType,
    company: assets,
    lineCount: input.lineCount ?? 4,
  });

  return { config, engineKey, data };
};

export const previewHtml = async (input: PreviewInput): Promise<string> => {
  const { config, engineKey, data } = await resolvePreview(input);
  return renderDocumentHtml({ data, config, engineKey });
};

export const previewPdf = async (input: PreviewInput): Promise<Buffer> => {
  const { config, engineKey, data } = await resolvePreview(input);
  const html = renderDocumentHtml({ data, config, engineKey });
  const furniture = buildPageFurniture(data, config);

  return renderPdf(html, { ...furniture, marginsMm: config.layout.marginsMm });
};

export const availableLayouts = () =>
  layoutKeys.map((key) => {
    const layout = getLayout(key);
    return { key: layout.key, name: layout.name, description: layout.description };
  });
