// What the notification that stays up while someone is on the clock says, with nothing from React Native in it so scripts/test-clock-notice.mjs can run it
// in Node. `card` is the open job card with what is waiting on the phone laid over it (or null); `sameDay` is whether it is still today's shift
// (openCardState in shared/field-core.js). → null when there is nothing to show, else its key (which changes only when what it says does), title and body.
export const CLOCK_NOTICE_ID = 'on-the-clock';
export const CLOCK_CHANNEL = { id: 'clock', name: 'On the clock' };

// "07:05" as "7:05 am".
export function clock12(hm: string) {
  const [h, m] = String(hm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hm || '');
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
type Card = { work_date: string; clock_on: string; job_id?: string | null; job_label?: string | null; activity_label?: string | null; pending?: boolean };
export function clockNotice(card: Card | null | undefined, sameDay: boolean): { key: string; title: string; body: string } | null {
  if (!card || !card.clock_on || !sameDay) return null;
  const what = card.job_label || (card.job_id ? `#${card.job_id}` : card.activity_label || '');
  const title = `On the clock since ${clock12(card.clock_on)}`;
  const body = [what, card.pending ? 'Waiting to send' : '', 'Open AccurateHR to clock off'].filter(Boolean).join(' · ');
  return { key: `${card.work_date} ${card.clock_on} ${what} ${card.pending ? 1 : 0}`, title, body };
}
