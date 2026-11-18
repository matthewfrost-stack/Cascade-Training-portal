import type { createServiceClient } from '@/lib/apiAuth';
import { escapeHtml } from '@/lib/email';

/**
 * Monthly "training due" email for each home's managers.
 *
 * The state of every matrix cell comes from evaluateHomes() in
 * src/lib/compliance.ts, shared with the compliance report, so the email,
 * the report and the Training Matrix always agree.
 */

import { evaluateHomes, LOOKAHEAD_DAYS, ukToday, MissingMigrationError, type Cell } from '@/lib/compliance';

export { LOOKAHEAD_DAYS, ukToday, MissingMigrationError };

type ServiceClient = ReturnType<typeof createServiceClient>;

export type DigestItem = {
  course: string;
  date?: string;          // expiry date (YYYY-MM-DD), when there is one
  noExpiryDate?: boolean; // completed, but no expiry date recorded
  bookedOn?: string;      // earliest upcoming booking (YYYY-MM-DD), if any
};

export type DigestPerson = { name: string; items: DigestItem[] };

export type DigestCounts = { expired: number; missing: number; expiring: number; allocated: number };

export type HomeDigest = {
  locationId: string;
  locationName: string;
  managerEmail: string | null;
  expired: DigestPerson[];
  missing: DigestPerson[];
  expiring: DigestPerson[];
  allocated: DigestPerson[];
  counts: DigestCounts;
};

// ---------- dates ----------

/** The month a send belongs to, e.g. '2026-12'. */
export function digestPeriod(now: Date = new Date()): string {
  return ukToday(now).slice(0, 7);
}

export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------- data ----------

/** Builds the digest for every home (or just `onlyLocationId`), from the shared cell rules. */
export async function buildHomeDigests(
  service: ServiceClient,
  options: { onlyLocationId?: string; now?: Date } = {}
): Promise<HomeDigest[]> {
  const homes = await evaluateHomes(service, {
    onlyLocationIds: options.onlyLocationId ? [options.onlyLocationId] : undefined,
    now: options.now,
  });

  const finish = (bucket: Map<string, DigestPerson>): DigestPerson[] =>
    Array.from(bucket.values())
      .map((person) => ({
        ...person,
        items: person.items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.course.localeCompare(b.course)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  const countItems = (people: DigestPerson[]) => people.reduce((sum, person) => sum + person.items.length, 0);

  return homes.map((home) => {
    const names = new Map(home.people.map((p) => [p.staffId, p.name]));
    const courseNames = new Map(home.columns.map((c) => [c.key, c.name]));
    const buckets = { expired: new Map<string, DigestPerson>(), missing: new Map<string, DigestPerson>(), expiring: new Map<string, DigestPerson>(), allocated: new Map<string, DigestPerson>() };
    const addTo = (bucket: Map<string, DigestPerson>, cell: Cell, item: DigestItem) => {
      const person = bucket.get(cell.staffId) || { name: names.get(cell.staffId) || 'Unknown', items: [] };
      person.items.push(item);
      bucket.set(cell.staffId, person);
    };

    for (const cell of home.cells) {
      const course = courseNames.get(cell.courseKey) || cell.courseKey;
      const booked = cell.bookedOn ? { bookedOn: cell.bookedOn } : {};
      if (cell.state === 'expired') addTo(buckets.expired, cell, cell.noExpiryDate ? { course, noExpiryDate: true, ...booked } : { course, date: cell.expiry, ...booked });
      else if (cell.state === 'missing') addTo(buckets.missing, cell, { course, ...booked });
      else if (cell.state === 'expiring') addTo(buckets.expiring, cell, { course, date: cell.expiry, ...booked });
      else if (cell.state === 'allocated') addTo(buckets.allocated, cell, { course, ...booked });
    }

    const expired = finish(buckets.expired);
    const missing = finish(buckets.missing);
    const expiring = finish(buckets.expiring);
    const allocated = finish(buckets.allocated);
    return {
      locationId: home.locationId,
      locationName: home.locationName,
      managerEmail: home.managerEmail,
      expired,
      missing,
      expiring,
      allocated,
      counts: { expired: countItems(expired), missing: countItems(missing), expiring: countItems(expiring), allocated: countItems(allocated) },
    };
  });
}

// ---------- email ----------

export function digestSubject(home: HomeDigest, period: string): string {
  return `Training due – ${home.locationName} – ${periodLabel(period)}`;
}

export function renderDigestEmail(home: HomeDigest, period: string, baseUrl: string, opts: { noManagerEmail?: boolean } = {}): string {
  const total = home.counts.expired + home.counts.missing + home.counts.expiring + home.counts.allocated;
  const safeHome = escapeHtml(home.locationName);
  const safeMonth = escapeHtml(periodLabel(period));
  const calendarUrl = escapeHtml(`${baseUrl}/apps/booking-calendar`);
  const matrixUrl = escapeHtml(`${baseUrl}/training-matrix`);

  const section = (title: string, colour: string, people: DigestPerson[], count: number, describe: (item: DigestItem) => string) => {
    if (people.length === 0) return '';
    const rows = people
      .map((person) => {
        const items = person.items
          .map((item) => {
            const booked = item.bookedOn
              ? ` <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:#dcfce7;color:#166534;font-size:12px;font-weight:bold;">Booked ${escapeHtml(formatShortDate(item.bookedOn))}</span>`
              : '';
            return `<li style="margin:2px 0;">${escapeHtml(item.course)}${describe(item)}${booked}</li>`;
          })
          .join('');
        return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0 0 2px 0;font-weight:bold;color:#111827;">${escapeHtml(person.name)}</p>
          <ul style="margin:0;padding-left:20px;color:#374151;">${items}</ul>
        </td></tr>`;
      })
      .join('');
    return `
      <tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0 0 6px 0;font-size:16px;font-weight:bold;color:${colour};border-left:4px solid ${colour};padding-left:10px;">${title} (${count})</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>`;
  };

  const expiredText = (item: DigestItem) =>
    item.noExpiryDate ? ' – no expiry date recorded' : ` – expired ${escapeHtml(formatShortDate(item.date || ''))}`;

  const noEmailBanner = opts.noManagerEmail
    ? `<tr><td style="padding:16px 32px 0 32px;"><p style="margin:0;padding:12px;border:1px solid #fcd34d;background:#fffbeb;border-radius:6px;color:#92400e;font-size:14px;">
        This home does not have a managers' email address set, so this has been sent to the training inbox. Add it in <strong>Admin → Manage Venues</strong>, then edit ${safeHome}.
      </p></td></tr>`
    : '';

  const body = total === 0
    ? `<tr><td style="padding:24px 32px 0 32px;"><p style="margin:0;padding:16px;border-radius:6px;background:#f0fdf4;color:#166534;font-size:15px;">✅ <strong>All up to date.</strong> Nobody at ${safeHome} has training expired, never completed, expiring in the next ${LOOKAHEAD_DAYS} days, or waiting to be completed.</p></td></tr>`
    : `
      <tr><td style="padding:24px 32px 0 32px;color:#1f2937;font-size:15px;line-height:1.6;">
        <p style="margin:0;">Here is the training for <strong>${safeHome}</strong> that needs booking or chasing. Please book these onto courses so everyone stays in date.</p>
      </td></tr>
      ${section('🔴 Expired', '#dc2626', home.expired, home.counts.expired, expiredText)}
      ${section('⚫ Never completed', '#374151', home.missing, home.counts.missing, () => '')}
      ${section(`🟠 Expiring in the next ${LOOKAHEAD_DAYS} days`, '#ea580c', home.expiring, home.counts.expiring, (item) => ` – expires ${escapeHtml(formatShortDate(item.date || ''))}`)}
      ${section('🟡 Allocated, not yet completed', '#ca8a04', home.allocated, home.counts.allocated, () => '')}`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="background-color:#1e3a5f;padding:20px 32px;border-radius:8px 8px 0 0;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">Training due – ${safeHome}</p>
            <p style="margin:4px 0 0 0;color:#cbd5e1;font-size:13px;">${safeMonth} · Training Team</p>
          </td>
        </tr>
        ${noEmailBanner}
        ${body}
        <tr><td style="padding:24px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#1d4ed8;border-radius:6px;"><a href="${calendarUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;">Open booking calendar</a></td>
            <td style="width:12px;"></td>
            <td style="border:1px solid #1d4ed8;border-radius:6px;"><a href="${matrixUrl}" style="display:inline-block;padding:11px 20px;color:#1d4ed8;font-weight:bold;text-decoration:none;font-size:15px;">View training matrix</a></td>
          </tr></table>
        </td></tr>
        <tr>
          <td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
            <p style="margin:0;">Sent automatically on the 1st of each month by the Cascade Portal. “Booked” means the person is already on an upcoming session for that course. If something looks wrong, reply to this email and the Training Team will check the matrix.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
