/**
 * Date presentation.
 *
 * A date-only value ("2026-04-01") is a calendar date, not an instant: parsing it
 * as UTC and printing it in UTC is what stops a document dated 1 April from
 * showing as 31 March for anyone west of Greenwich. Timestamps are different —
 * they *are* instants, so those are shown in the reader's own time zone.
 */

export const formatDate = (value: string | null | undefined, fallback = '—'): string =>
  value
    ? new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : fallback;

export const formatDateTime = (value: string | null | undefined, fallback = '—'): string =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : fallback;

/** Today as an ISO date-only string in the reader's own calendar. */
export const todayIso = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** `days` after an ISO date-only string, as another ISO date-only string. */
export const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Hands a fetched blob to the browser as a download, then releases the URL. */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
