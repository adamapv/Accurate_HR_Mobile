// Cents as dollars, the way the web app writes them: "$45.50", or "$46" when `whole`.
export function fmtMoney(cents: number | null | undefined, { whole }: { whole?: boolean } = {}) {
  if (cents == null) return '—';
  const opts = whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return '$' + (whole ? Math.round(cents / 100) : cents / 100).toLocaleString('en-AU', opts);
}
