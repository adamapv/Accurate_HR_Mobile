// The week, as Home and My week show it: this week's hours as a card (how far through, the hours by day as bars, where the week stands, and Submit), and the
// week's seven days with the jobs published for each. What each says is the web app's own rule (shared/field-core.js).
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { byWorkDate, SCHED_WORDS, schedRowTitle, weekBars, weekCard, weekDaysOf } from '@shared/field-core.js';
import { parseDay } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Dots } from '@/dots';
import { Body, Button, Card, Pill, Touch, type Tone } from '@/ui';

type WeekLike = { period?: { period_start: string } | null; total_hours?: number; cards?: unknown[]; entries?: unknown[]; days?: unknown[]; pending?: number } | null;
type Bars = { target: number; days: { date: string; hours: number; height: number; weekday: boolean; today: boolean; future: boolean }[] };
type CardState = { hours: number | null; pct: number; sub: string; pill: { tone: Tone; text: string } | null; foot: string; toSend: string[]; canSend: boolean; sendLabel: string; submitted: number };
export type WeekSchedRow = { work_date: string; company_id: string; job_id: string; job_name: string | null; site_name: string | null; activity?: boolean };

const hoursText = (n: number) => `${Number(n || 0).toFixed(1).replace(/\.0$/, '')}h`;

// `onSubmit` is offered when there are days to send; `onPullBack` when some are with the approver. With neither, the card only says where the week stands.
export function WeekHoursCard({ week, expected, fromJobs, today, onSubmit, onPullBack, busy }: { week: WeekLike; expected: number; fromJobs: boolean; today: string; onSubmit?: (dates: string[]) => void; onPullBack?: () => void; busy?: boolean }) {
  const t = useTheme();
  const c = weekCard(week, { expected, fromJobs, canSubmit: !!onSubmit }) as CardState;
  const bars = weekBars(week, expected, today) as Bars | null;
  const full = c.pct >= 100;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>MY WEEK</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {c.hours == null ? <Body tone="muted">…</Body> : <Dots text={hoursText(c.hours)} size={34} color={full ? t.ok : t.fg} />}
            <Body tone="muted">of {expected}h</Body>
          </View>
        </View>
        {c.pill && <Pill tone={c.pill.tone}>{c.pill.text}</Pill>}
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(c.pct) }} style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${c.pct}%`, height: 8, borderRadius: 4, backgroundColor: full ? t.ok : t.accent }} />
      </View>
      <Body tone="muted">{c.sub}</Body>
      {bars && (
        <View accessible accessibilityLabel={`Hours by day: ${bars.days.map(d => `${parseDay(d.date).toLocaleDateString('en-AU', { weekday: 'long' })} ${hoursText(d.hours)}`).join(', ')}`} style={{ flexDirection: 'row', gap: 8, height: 96 }}>
          {bars.days.map(d => (
            <View key={d.date} importantForAccessibility="no-hide-descendants" style={{ flex: 1, gap: 6, opacity: d.future ? 0.45 : 1 }}>
              <View style={{ flex: 1, borderRadius: 8, backgroundColor: t.surface2, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ height: `${d.height}%`, borderRadius: 8, backgroundColor: d.today ? t.accent : t.accent2, opacity: d.today ? 1 : 0.6 }} />
                {d.weekday && <View style={{ position: 'absolute', left: 0, right: 0, bottom: `${bars.target}%`, height: 1.5, backgroundColor: t.dim, opacity: 0.6 }} />}
              </View>
              <Text style={{ textAlign: 'center', fontSize: 11.5, fontWeight: d.today ? '800' : '600', color: d.today ? t.accent2 : t.dim }}>{parseDay(d.date).toLocaleDateString('en-AU', { weekday: 'narrow' })}</Text>
            </View>
          ))}
        </View>
      )}
      {!c.pill && <Body tone="muted">{c.foot}</Body>}
      {c.canSend && onSubmit && <Button icon="paper-plane-outline" onPress={() => onSubmit(c.toSend)} disabled={busy}>{c.sendLabel}</Button>}
      {c.submitted > 0 && onPullBack && <Button kind="plain" icon="arrow-undo-outline" onPress={onPullBack} disabled={busy}>Pull back</Button>}
    </Card>
  );
}

const dow = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { weekday: 'short' });

// The week's seven days, each with the jobs published for it; today is marked, and the next four weeks are a tap away.
export function WeekSchedule({ rows, today, loading }: { rows: WeekSchedRow[] | undefined; today: string; loading?: boolean }) {
  const t = useTheme();
  const byDay = byWorkDate(rows) as Record<string, WeekSchedRow[]>;
  return (
    <Card>
      {loading && !rows ? <Body tone="muted">Loading…</Body> : (weekDaysOf(today) as string[]).map(d => {
        const list = byDay[d] || [], isToday = d === today, past = d < today;
        return (
          <View key={d} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', opacity: past ? 0.5 : 1 }}>
            <View style={{ width: 46, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: isToday ? t.accent : t.surface2 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: isToday ? '#FFFFFF' : t.muted }}>{dow(d).toUpperCase()}</Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: isToday ? '#FFFFFF' : t.fg }}>{parseDay(d).getDate()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2, paddingTop: 4 }}>
              {list.length === 0 ? <Body tone="muted">{(past ? SCHED_WORDS.past : SCHED_WORDS.none) as string}</Body> : list.map(r => {
                const title = schedRowTitle(r) as { tag: string; name: string };
                return <Body key={`${r.company_id}:${r.job_id}`} strong={isToday}>{[title.tag, title.name].filter(Boolean).join(' ')}{r.site_name ? ` · ${r.site_name}` : ''}</Body>;
              })}
            </View>
          </View>
        );
      })}
      <Touch accessibilityRole="button" onPress={() => router.push('/schedule')} style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: t.accent2, fontSize: 15.5, fontWeight: '800' }}>{SCHED_WORDS.more as string}</Text>
      </Touch>
    </Card>
  );
}
