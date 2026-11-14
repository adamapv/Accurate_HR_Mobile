// The pieces a day is shown with, on the Job card tab and in the day review: its hours in dots, its cards along a bar from 6am to 6pm, the cards as rows, and
// what is missing from it (a long card with no lunch, a published job with no time). What each one says is the web app's own rule (shared/field-core.js).
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cardEntryMins, DAY_WORDS, dayTimeline, gapText, NO_LUNCH_FIX, noLunchText, nameHash } from '@shared/field-core.js';
import { hmMins } from '@shared/field-core.js';
import { fmtMins, localNowHM } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Dots } from '@/dots';
import { Body, Button, List, Notice, Pill, Row } from '@/ui';

export type DayCard = { id: string; work_date: string; clock_on: string; clock_off: string | null; lunch?: number | boolean | null; job_id?: string | null; company_id?: string | null; job_label: string | null; activity_label: string | null;
  splits?: { job_id: string }[] | null; pending?: boolean };
export type DayEntry = { card_id: string | null; work_date: string; start_time: string; end_time: string };
export type Gap = { work_date: string; company_id: string; job_id: string; job_name: string | null };
type Block = { card: DayCard; open: boolean; label: string; title: string; tint: string; left: number; width: number; named: boolean };
type Line = { blocks: Block[]; ticks: { m: number; left: number; label: string }[]; now: number | null; summary: string };

const JOB_COLOURS = ['#5468FF', '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#22C55E'], NO_JOB = '#64748B';

// The day's hours, big and in dots, with what stands beside them (a pill, a count).
export function DayHours({ label, mins, loading, children }: { label: string; mins: number; loading?: boolean; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>{label.toUpperCase()}</Text>
        {loading ? <Body tone="muted">…</Body> : <Dots text={fmtMins(mins)} size={34} color={t.fg} />}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 1 }}>{children}</View>
    </View>
  );
}

// The day's cards along a bar. A block opens its card when `onOpen` is given. The line for now moves with the minute.
export function DayTimeline({ cards, date, onOpen }: { cards: DayCard[]; date: string; onOpen?: (c: DayCard) => void }) {
  const t = useTheme();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(id); }, []);
  const line = dayTimeline(cards, date, hmMins(localNowHM())) as Line | null;
  if (!line) return null;
  return (
    <View accessible accessibilityLabel={`The day: ${line.summary}`} style={{ gap: 6 }}>
      <View style={{ height: 36, borderRadius: 12, backgroundColor: t.surface2, overflow: 'hidden' }}>
        {line.blocks.map(b => (
          <Pressable key={b.card.id} disabled={!onOpen} accessibilityLabel={b.title} onPress={() => onOpen?.(b.card)}
            style={{ position: 'absolute', top: 4, bottom: 4, left: `${b.left}%`, width: `${b.width}%`, borderRadius: 8, backgroundColor: b.tint ? JOB_COLOURS[nameHash(b.tint) % JOB_COLOURS.length] : NO_JOB, opacity: b.open ? 0.78 : 1,
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            {b.named && <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{b.label}</Text>}
          </Pressable>
        ))}
        {line.now !== null && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: `${line.now}%`, width: 2, backgroundColor: t.danger }} />}
      </View>
      <View importantForAccessibility="no-hide-descendants" style={{ height: 16 }}>
        {line.ticks.map(k => (
          <Text key={k.m} style={{ position: 'absolute', left: `${k.left}%`, width: 44, marginLeft: k.left < 4 ? 0 : k.left > 96 ? -44 : -22, textAlign: k.left < 4 ? 'left' : k.left > 96 ? 'right' : 'center', color: t.dim, fontSize: 11, fontWeight: '600' }}>{k.label}</Text>
        ))}
      </View>
    </View>
  );
}

// The day's cards, one line each: the job or activity, its times and lunch, and its hours (or that it is still on the phone, or on the clock).
export function DayCardRows({ cards, entries, onEdit }: { cards: DayCard[]; entries: DayEntry[]; onEdit?: (c: DayCard) => void }) {
  return (
    <List>
      {cards.map((c, i) => (
        <Row key={c.id} icon={c.job_label ? 'briefcase-outline' : 'clipboard-outline'} tint={c.clock_off ? 'blue' : 'green'} title={c.job_label || c.activity_label || (DAY_WORDS.noJob as string)}
          sub={`${c.clock_on}–${c.clock_off || '…'}${c.lunch ? ' · lunch' : ''}`} last={i === cards.length - 1} onPress={onEdit ? () => onEdit(c) : undefined}
          right={c.pending ? <Pill tone="warn">{DAY_WORDS.onPhone as string}</Pill> : c.clock_off ? <Pill tone="info">{fmtMins(cardEntryMins(entries, c) as number)}</Pill> : <Pill tone="ok">On the clock</Pill>} />
      ))}
    </List>
  );
}

// What is missing from the day, each with the way to put it right.
export function DayGaps({ noLunch, gaps, onEdit, onAdd }: { noLunch: DayCard | null; gaps: Gap[]; onEdit: (c: DayCard) => void; onAdd: (g: Gap) => void }) {
  return (
    <>
      {noLunch && (
        <Notice tone="warn" icon="restaurant-outline">
          {noLunchText(noLunch) as string}
          <View style={{ marginTop: 10 }}><Button kind="plain" onPress={() => onEdit(noLunch)}>{NO_LUNCH_FIX as string}</Button></View>
        </Notice>
      )}
      {gaps.map(g => (
        <Notice key={`${g.company_id}:${g.job_id}`} tone="warn" icon="calendar-outline">
          {gapText(g) as string}
          <View style={{ marginTop: 10 }}><Button kind="plain" icon="add" onPress={() => onAdd(g)}>{DAY_WORDS.addTime as string}</Button></View>
        </Notice>
      ))}
    </>
  );
}
