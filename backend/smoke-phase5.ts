/* eslint-disable no-console */
/**
 * Phase 5 smoke test against the live API and database.
 *
 * Creates a temporary Super Admin plus one customer, one item and a few
 * quotations, exercises the whole lifecycle, then removes everything it made —
 * including resetting the quotation number counter, so the first real quotation
 * still gets QT001.
 */
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

config({ path: '../.env' });

const API = 'http://localhost:4000/api';
const prisma = new PrismaClient();

const EMAIL = `zz-smoke5-${Date.now()}@internal.test`;
const PASSWORD = `Sm0ke5-${randomBytes(9).toString('base64url')}`;

let cookie = '';
const results: { name: string; ok: boolean; detail: string }[] = [];

const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

interface CallResult {
  status: number;
  body: any;
  text: string;
  headers: Headers;
}

const call = async (
  method: string,
  path: string,
  body?: unknown,
  useCookie = true,
): Promise<CallResult> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length && useCookie) {
    cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
  }

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON — a PDF or HTML body */
  }
  return { status: response.status, body: parsed, text, headers: response.headers };
};

let tempUserId: number | null = null;
let customerId: number | null = null;
let itemId: number | null = null;
const quotationIds: string[] = [];

const main = async () => {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const user = await prisma.user.create({
    data: {
      name: 'Smoke 5 (temporary)',
      email: EMAIL,
      passwordHash: await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      roleId: role.id,
      status: 'ACTIVE',
      mustChangePassword: false,
    },
  });
  tempUserId = user.id;

  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  check('sign in', login.status === 200);

  /* --- arrange: a customer and an item ---------------------------------- */
  const customer = await call('POST', '/customers', {
    name: 'Smoke5 Customer',
    taxTreatment: 'REGISTERED',
    gstin: '29AABCU9603R1ZM',
    defaultCurrencyCode: 'INR',
    placeOfSupplyStateCode: '29',
    addresses: [
      {
        type: 'BILLING',
        line1: '1 Test Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        country: 'India',
        postalCode: '560001',
        isDefault: true,
      },
    ],
  });
  customerId = customer.body?.data?.id;
  check('customer created', customer.status === 201, customer.body?.data?.customerCode);

  const groups = await call('GET', '/masters/tax-groups');
  const intra18 = groups.body.data.find((g: any) => g.name === 'GST 18% (Intra-state)');

  const item = await call('POST', '/items', {
    name: 'Smoke5 Website development',
    defaultRate: '100000',
    currencyCode: 'INR',
    hsnSacCode: '998314',
    defaultTaxGroupId: intra18.id,
  });
  itemId = item.body?.data?.id;
  check('item created', item.status === 201, item.body?.data?.itemCode);

  /* --- the PRD §16 worked example, end to end --------------------------- */
  const created = await call('POST', '/quotations', {
    customerId,
    documentDate: '2026-08-25',
    expiryDate: '2026-09-24',
    currencyCode: 'INR',
    placeOfSupplyStateCode: '29',
    subject: 'Smoke test quotation',
    discountMode: 'AMOUNT',
    discountValue: '5000',
    items: [
      {
        itemId,
        name: 'Website development',
        description: 'Phase 1',
        hsnSacCode: '998314',
        quantity: '1',
        rate: '100000',
        taxGroupId: intra18.id,
      },
    ],
  });

  const q = created.body?.data;
  if (q) quotationIds.push(q.id);

  check('quotation created', created.status === 201, q?.number);
  check(
    'number follows the confirmed format',
    /^QT\d{3,}\/2026-2027$/.test(q?.number ?? ''),
    q?.number,
  );
  check('status starts as DRAFT', q?.status === 'DRAFT');
  check('financial year resolved from the document date', q?.financialYearCode === '2026-27');

  check(
    'totals reproduce the PRD §16 example',
    q?.subtotal === '100000.00',
    `subtotal ${q?.subtotal}`,
  );
  check('taxable value is net of the discount', Number(q?.taxableTotal) === 95000, q?.taxableTotal);
  check('tax is 17,100 — computed on 95,000, not 100,000', Number(q?.taxTotal) === 17100, q?.taxTotal);
  check('grand total is 112,100', Number(q?.grandTotal) === 112100, q?.grandTotal);
  check(
    'tax split into CGST 9% and SGST 9%',
    q?.taxSummary?.byComponent?.length === 2,
    q?.taxSummary?.byComponent?.map((r: any) => `${r.label} ${r.taxAmount}`).join(' + '),
  );
  check(
    'amount in words matches the total',
    /One Lakh Twelve Thousand One Hundred Rupees Only/.test(q?.taxSummary?.amountInWords ?? ''),
    q?.taxSummary?.amountInWords,
  );
  check('customer details were snapshotted', q?.customerSnapshot?.gstin === '29AABCU9603R1ZM');

  /* --- totals are server-side, whatever the client claims --------------- */
  const tampered = await call('POST', '/quotations', {
    customerId,
    documentDate: '2026-08-25',
    currencyCode: 'INR',
    grandTotal: '1.00',
    taxTotal: '0.00',
    number: 'HACKED/0001',
    status: 'PAID',
    items: [{ name: 'Line', quantity: '1', rate: '1000', taxGroupId: intra18.id }],
  });
  const t = tampered.body?.data;
  if (t) quotationIds.push(t.id);
  check(
    'client-supplied totals, number and status are ignored',
    Number(t?.grandTotal) === 1180 &&
      /^QT\d{3,}\/2026-2027$/.test(t?.number ?? '') &&
      t?.number !== 'HACKED/0001' &&
      t?.status === 'DRAFT',
    `total ${t?.grandTotal}, number ${t?.number}, status ${t?.status}`,
  );

  /* --- lifecycle --------------------------------------------------------- */
  const badTransition = await call('POST', `/quotations/${q.id}/status`, { status: 'ACCEPTED' });
  check(
    'a draft cannot jump straight to accepted',
    badTransition.status === 422,
    badTransition.body?.error?.message,
  );

  const sent = await call('POST', `/quotations/${q.id}/status`, { status: 'SENT' });
  check('draft → sent', sent.body?.data?.status === 'SENT');

  const noReason = await call('PATCH', `/quotations/${q.id}`, { subject: 'Changed' });
  check(
    'editing an issued quotation without a reason is refused',
    noReason.status === 422 && noReason.body?.error?.code === 'CHANGE_REASON_REQUIRED',
    noReason.body?.error?.code,
  );

  const edited = await call('PATCH', `/quotations/${q.id}`, {
    changeReason: 'Client asked for an extra licence',
    items: [
      {
        itemId,
        name: 'Website development',
        hsnSacCode: '998314',
        quantity: '1',
        rate: '100000',
        taxGroupId: intra18.id,
      },
      { name: 'Extra licence', quantity: '1', rate: '20000', taxGroupId: intra18.id },
    ],
  });
  check('edit with a reason succeeds', edited.status === 200, `total ${edited.body?.data?.grandTotal}`);
  check('document version advanced to 2', edited.body?.data?.currentVersion === 2);
  check(
    'totals recalculated after the edit',
    Number(edited.body?.data?.grandTotal) > 112100,
    edited.body?.data?.grandTotal,
  );

  const history = await call('GET', `/quotations/${q.id}/history`);
  check('a revision was recorded', history.body?.data?.length === 1, history.body?.data?.[0]?.changeReason);
  check(
    'the revision lists what changed',
    (history.body?.data?.[0]?.changedFields ?? []).includes('grandTotal'),
    (history.body?.data?.[0]?.changedFields ?? []).join(', '),
  );

  const v1 = await call('GET', `/quotations/${q.id}/versions/1`);
  check(
    'version 1 kept its own figures',
    Number((v1.body?.data?.previous as any)?.grandTotal) === 112100,
    (v1.body?.data?.previous as any)?.grandTotal,
  );

  /* --- rendering --------------------------------------------------------- */
  const preview = await call('GET', `/quotations/${q.id}/preview`);
  check(
    'HTML preview renders the real document',
    preview.status === 200 && preview.text.includes(q.number),
    `${preview.text.length} bytes`,
  );

  const pdf = await call('POST', `/quotations/${q.id}/pdf`);
  check('PDF generated', pdf.status === 200, `${pdf.body?.data?.sizeBytes} bytes`);

  const cached = await call('POST', `/quotations/${q.id}/pdf`);
  check('a second request reuses the stored file', cached.body?.data?.cached === true);

  const download = await fetch(`${API}/quotations/${q.id}/pdf`, { headers: { Cookie: cookie } });
  const bytes = Buffer.from(await download.arrayBuffer());
  check(
    'download streams a real PDF',
    download.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-',
    `${bytes.byteLength} bytes`,
  );

  /* --- sharing (decision Q9) --------------------------------------------- */
  const share = await call('POST', `/quotations/${q.id}/share-links`, {});
  const shareUrl: string = share.body?.data?.url ?? '';
  check('share link created', share.status === 201 && shareUrl.includes('/api/public/documents/'));
  check('a WhatsApp deep link is offered', (share.body?.data?.whatsappUrl ?? '').startsWith('https://wa.me/'));

  const anonymous = await fetch(shareUrl);
  const anonymousBytes = Buffer.from(await anonymous.arrayBuffer());
  check(
    'the link works with no session at all',
    anonymous.status === 200 && anonymousBytes.subarray(0, 5).toString() === '%PDF-',
    `${anonymousBytes.byteLength} bytes`,
  );

  const afterView = await call('GET', `/quotations/${q.id}`);
  check(
    'opening the link marked the quotation VIEWED',
    afterView.body?.data?.status === 'VIEWED',
    afterView.body?.data?.status,
  );

  const badToken = await fetch(`${API}/public/documents/${'x'.repeat(43)}`);
  check('an unknown token is a plain 404', badToken.status === 404);

  const shareId = share.body?.data?.id;
  await call('DELETE', `/quotations/${q.id}/share-links/${shareId}`);
  const revoked = await fetch(shareUrl);
  check('a revoked link stops working', revoked.status === 404);

  /* --- duplicate and delete ---------------------------------------------- */
  const duplicate = await call('POST', `/quotations/${q.id}/duplicate`);
  if (duplicate.body?.data) quotationIds.push(duplicate.body.data.id);
  check(
    'duplicate creates a fresh draft with its own number',
    duplicate.status === 201 &&
      duplicate.body?.data?.status === 'DRAFT' &&
      duplicate.body?.data?.number !== q.number &&
      /^QT\d{3,}\/2026-2027$/.test(duplicate.body?.data?.number ?? ''),
    duplicate.body?.data?.number,
  );

  const deleteIssued = await call('DELETE', `/quotations/${q.id}`);
  check(
    'an issued quotation cannot be deleted',
    deleteIssued.status === 422,
    deleteIssued.body?.error?.message?.slice(0, 60),
  );

  const deleteDraft = await call('DELETE', `/quotations/${duplicate.body.data.id}`);
  check('a draft can be soft-deleted', deleteDraft.status === 200);

  /* --- read-only role ----------------------------------------------------- */
  const financeEmail = process.env.SEED_FINANCE_EMAIL;
  if (financeEmail) {
    const adminCookie = cookie;
    cookie = '';
    const financeLogin = await call('POST', '/auth/login', {
      email: financeEmail,
      password: process.env.SEED_FINANCE_PASSWORD,
    });

    if (financeLogin.status === 200) {
      const list = await call('GET', '/quotations');
      check('Finance Viewer can read quotations', list.status === 200, `${list.body?.meta?.total} rows`);

      const create = await call('POST', '/quotations', {
        customerId,
        documentDate: '2026-08-25',
        currencyCode: 'INR',
        items: [{ name: 'x', quantity: '1', rate: '1' }],
      });
      check('Finance Viewer cannot create a quotation', create.status === 403, create.body?.error?.code);

      const status = await call('POST', `/quotations/${q.id}/status`, { status: 'ACCEPTED' });
      check('Finance Viewer cannot change status', status.status === 403);

      const dl = await fetch(`${API}/quotations/${q.id}/pdf`, { headers: { Cookie: cookie } });
      check('Finance Viewer can still download the PDF', dl.status === 200);
    }
    cookie = adminCookie;
  }
};

main()
  .catch((error: unknown) => {
    check('smoke run completed without throwing', false, (error as Error).message);
  })
  .finally(async () => {
    try {
      for (const id of quotationIds) {
        const bigId = BigInt(id);
        await prisma.documentShare.deleteMany({ where: { entityType: 'QUOTATION', entityId: bigId } });
        await prisma.documentFile.deleteMany({ where: { entityType: 'QUOTATION', entityId: bigId } });
        await prisma.quotationRevision.deleteMany({ where: { quotationId: bigId } });
        await prisma.quotation.delete({ where: { id: bigId } }).catch(() => undefined);
      }
      if (itemId) await prisma.item.delete({ where: { id: itemId } }).catch(() => undefined);
      if (customerId) {
        await prisma.customerAddress.deleteMany({ where: { customerId } });
        await prisma.customerContact.deleteMany({ where: { customerId } });
        await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
      }
      if (tempUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: tempUserId } });
        await prisma.auditLog.updateMany({ where: { userId: tempUserId }, data: { userId: null } });
        await prisma.user.delete({ where: { id: tempUserId } }).catch(() => undefined);
      }

      /* Put the counter back to whatever the remaining real quotations require,
         so the first genuine quotation still gets QT001 — but never below a
         number that is already taken, which the unique index would reject. */
      const series = await prisma.numberingSeries.findFirst({ where: { docType: 'QUOTATION' } });
      if (series) {
        const remaining = await prisma.quotation.findMany({ select: { number: true } });
        const highest = remaining.reduce((max, row) => {
          const match = /^\D*(\d+)/.exec(row.number);
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0);

        await prisma.documentSequence.updateMany({
          where: { numberingSeriesId: series.id },
          data: { lastNumber: highest },
        });
      }

      console.log('\n  cleanup: quotations, item, customer, temp user removed; QT counter reset to 0');
    } catch (error) {
      console.log(`\n  cleanup problem: ${(error as Error).message}`);
    }

    await prisma.$disconnect();

    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n  ${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length === 0 ? 0 : 1);
  });
