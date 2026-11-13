// Today and now by the phone's own clock, as the web Field view reads them, and a date the way the app writes one.
const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const localToday = () => isoLocal(new Date());
export const localNowHM = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
// 'YYYY-MM-DD' is a calendar day, read as local.
export function parseDay(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
export const fmtDate = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMins = (m: number) => `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
// A moment as a time of day: "9:12 am".
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
// A moment the Worker stored ("2026-11-13 04:12:00" in UTC, or an ISO time) as the phone's own date and time: "13 Nov 2026, 3:12 pm". '' for nothing.
export function fmtDateTime(v: string | null | undefined) {
  if (!v) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? `${v.replace(' ', 'T')}Z` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
