// Today's tasks on Home, for a driver: the things the office has put on their day, one after the other. Made to be as plain as it can be: the next task is one big card (what,
// where from, where to, each a tap to the maps app, the notes) with one very wide Done button, and nothing else on it asks anything. Done moves on to the next, and Undo stays a
// few seconds. What a day of tasks is, and the words, are the web Field view's own (shared/task-core.js); what is read and sent is src/lib/use-tasks.ts, and with no signal Done
// waits in the outbox like every other write. Nothing shows for anyone who is not a driver.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dayWords, isLate, jobWords, laterWords, placeLines, progressWords, routeWords, TASK_WORDS, taskTitle } from '@shared/task-core.js';
import { feel } from '@/lib/haptics';
import { LOCK_MS, TASK_SIZES, UNDO_MS, type TaskRow } from '@/lib/tasks-core';
import { useTasks } from '@/lib/use-tasks';
import { radius, space, useTheme } from '@/theme';
import { Body, Heading, List, Notice, Problem, Touch } from '@/ui';

type Place = { key: string; label: string; place: string; href: string };

// A task's number in the day's order, in a circle.
function Num({ n, size }: { n: number; size: number }) {
  const t = useTheme();
  return (
    <View style={[styles.num, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.surface2 }]}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.numText, { color: t.accent2, fontSize: size * 0.5 }]}>{n}</Text>
    </View>
  );
}

// The next task, big: its number, what it is, where from and where to (each opens the map), the notes, and Done.
function BigTask({ row, n, today, busy, held, onDone, onMap }: { row: TaskRow; n: number; today: string; busy: boolean; held: boolean; onDone: () => void; onMap: (href: string) => void }) {
  const t = useTheme();
  const title = taskTitle(row) as string;
  const late = isLate(row, today) as boolean;
  const job = row.job_id ? (jobWords(row) as string) : '';
  const off = busy || held;
  return (
    <View style={[styles.big, { backgroundColor: t.surface, borderColor: t.accent }]}>
      <View style={styles.bigTop}>
        <Num n={n} size={48} />
        {late && <Text style={[styles.late, { color: t.warn }]}>{`${TASK_WORDS.late}: ${dayWords(row.task_date) as string}`}</Text>}
        {!!row.waiting && <Text style={[styles.late, { color: t.accent2 }]}>Waiting to send</Text>}
      </View>
      <Text accessibilityRole="header" style={[styles.bigTitle, { color: t.fg }]}>{title}</Text>
      {(placeLines(row) as Place[]).map(l => (
        <Touch key={l.key} accessibilityRole="link" accessibilityLabel={`${l.label}: ${l.place}. Opens the map.`} disabled={!l.href} onPress={() => { feel.pick(); onMap(l.href); }} style={[styles.place, { backgroundColor: t.surface2 }]}>
          <View style={styles.placeText}>
            <Text style={[styles.placeLabel, { color: t.muted }]}>{l.label.toUpperCase()}</Text>
            <Text style={[styles.placeName, { color: t.fg }]}>{l.place}</Text>
          </View>
          {!!l.href && <Ionicons name="navigate-circle-outline" size={36} color={t.accent2} />}
        </Touch>
      ))}
      {!!row.notes && <Text style={[styles.notes, { color: t.fg }]}>{row.notes}</Text>}
      {!!job && <Text style={[styles.job, { color: t.muted }]}>{`Job ${job}`}</Text>}
      {!!row.failed && <Notice tone="danger">{`Not sent: ${row.failed} You can try again from the list below.`}</Notice>}
      <Touch accessibilityRole="button" accessibilityLabel={`Done: ${title}`} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onDone} style={[styles.done, { backgroundColor: t.ok }, off && styles.dim]}>
        {busy ? <ActivityIndicator size="large" color={t.bg} /> : (
          <>
            <Ionicons name="checkmark" size={36} color={t.bg} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.doneText, { color: t.bg }]}>{TASK_WORDS.doneButton}</Text>
          </>
        )}
      </Touch>
    </View>
  );
}

// A task still to do that is not the next one: its number, its name and the way it goes. Pressing it makes it the big one.
function OpenRow({ row, n, today, last, onPress }: { row: TaskRow; n: number; today: string; last: boolean; onPress: () => void }) {
  const t = useTheme();
  const sub = [isLate(row, today) && `${TASK_WORDS.late}: ${dayWords(row.task_date) as string}`, routeWords(row) as string].filter(Boolean).join(' · ');
  return (
    <Touch accessibilityRole="button" accessibilityLabel={`${taskTitle(row) as string}${sub ? `. ${sub}` : ''}. Show this one.`} scale={0.985} onPress={() => { feel.pick(); onPress(); }}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
      <Num n={n} size={36} />
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: t.fg }]}>{taskTitle(row) as string}</Text>
        {!!sub && <Text numberOfLines={2} style={[styles.rowSub, { color: row.failed ? t.danger : t.muted }]}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.dim} />
    </Touch>
  );
}

// A task finished today, with its own Undo.
function DoneRow({ row, last, busy, onUndo }: { row: TaskRow; last: boolean; busy: boolean; onUndo: () => void }) {
  const t = useTheme();
  const sub = row.waiting ? 'Waiting to send' : row.failed ? `Not sent: ${row.failed}` : '';
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
      <View style={[styles.num, { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface2 }]}><Ionicons name="checkmark" size={20} color={t.ok} /></View>
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: t.muted }]}>{taskTitle(row) as string}</Text>
        {!!sub && <Text numberOfLines={2} style={[styles.rowSub, { color: row.failed ? t.danger : t.accent2 }]}>{sub}</Text>}
      </View>
      <UndoButton label={`Undo: ${taskTitle(row) as string}`} busy={busy} onPress={onUndo} />
    </View>
  );
}

function UndoButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Touch accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress} style={[styles.undo, { backgroundColor: t.surface2 }, busy && styles.dim]}>
      <Ionicons name="arrow-undo" size={18} color={t.fg} />
      <Text style={[styles.undoText, { color: t.fg }]}>{TASK_WORDS.undo}</Text>
    </Touch>
  );
}

export function TodaysTasks({ today }: { today: string }) {
  const t = useTheme();
  const tasks = useTasks(today);
  const [pickedId, setPickedId] = useState<string | null>(null);   // a task chosen from the rows to be the big one
  const [undo, setUndo] = useState<TaskRow | null>(null);          // the task just finished, until the bar goes
  const [held, setHeld] = useState(false);                         // Done is held for a moment after a tap
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(undoTimer.current); clearTimeout(holdTimer.current); }, []);

  const { day } = tasks;
  if (!tasks.driver) return null;
  if (!day) return tasks.read.error ? <View style={styles.section}><Heading>{TASK_WORDS.today}</Heading><Notice tone="warn">{tasks.read.error}</Notice></View> : null;
  if (day.total === 0 && !day.later) return null;

  const shown = day.open.find(r => r.id === pickedId) || day.next;
  const others = day.open.filter(r => r !== shown);
  const complete = day.total > 0 && day.done.length >= day.total;
  const openMap = (href: string) => { void Linking.openURL(href).catch(() => { /* no maps app: the place is still written out */ }); };
  const finish = async (row: TaskRow) => {
    feel.tap();
    setHeld(true); clearTimeout(holdTimer.current); holdTimer.current = setTimeout(() => setHeld(false), LOCK_MS);
    if (!(await tasks.send(row, 'done'))) return;
    setPickedId(null);
    clearTimeout(undoTimer.current);
    setUndo(row);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  const reopen = async (row: TaskRow) => {
    feel.tap();
    clearTimeout(undoTimer.current); setUndo(null);
    await tasks.send(row, 'reopen');
  };

  return (
    <View style={styles.section}>
      <Heading right={day.total > 0 ? <Text style={[styles.progress, { color: complete ? t.ok : t.accent2 }]}>{progressWords(day.done.length, day.total) as string}</Text> : undefined}>{TASK_WORDS.today}</Heading>
      <Problem>{tasks.problem}</Problem>
      {!!undo && (
        <View accessibilityRole="alert" style={[styles.undoBar, { backgroundColor: t.surface, borderColor: t.ok }]}>
          <Ionicons name="checkmark-circle" size={26} color={t.ok} />
          <Text numberOfLines={2} style={[styles.undoBarText, { color: t.fg }]}>{`Done: ${taskTitle(undo) as string}`}</Text>
          <UndoButton label={`Undo: ${taskTitle(undo) as string}`} busy={tasks.busy === undo.id} onPress={() => { void reopen(undo); }} />
        </View>
      )}
      {shown
        ? <BigTask row={shown} n={day.open.indexOf(shown) + 1} today={today} busy={tasks.busy === shown.id} held={held} onDone={() => { void finish(shown); }} onMap={openMap} />
        : day.total > 0
          ? (
            <View style={[styles.allDone, { backgroundColor: t.surface, borderColor: t.ok }]}>
              <Ionicons name="checkmark-circle" size={48} color={t.ok} />
              <Text style={[styles.allDoneText, { color: t.fg }]}>{TASK_WORDS.allDone}</Text>
            </View>
          )
          : <Body tone="muted">No tasks today.</Body>}
      {others.length > 0 && (
        <List>{others.map((r, i) => <OpenRow key={r.id} row={r} n={day.open.indexOf(r) + 1} today={today} last={i === others.length - 1} onPress={() => setPickedId(r.id)} />)}</List>
      )}
      {day.done.length > 0 && (
        <List>{day.done.map((r, i) => <DoneRow key={r.id} row={r} last={i === day.done.length - 1} busy={tasks.busy === r.id} onUndo={() => { void reopen(r); }} />)}</List>
      )}
      {!!day.later && <Body tone="muted">{laterWords(day.later, today) as string}</Body>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  progress: { fontSize: 17, fontWeight: '800' },
  num: { alignItems: 'center', justifyContent: 'center' },
  numText: { fontWeight: '900' },
  big: { borderRadius: radius.xl, borderWidth: 2, padding: space.lg, gap: space.md },
  bigTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  late: { flexShrink: 1, fontSize: 15, fontWeight: '800' },
  bigTitle: { fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  place: { minHeight: 72, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: space.md },
  placeText: { flex: 1, minWidth: 0, gap: 2 },
  placeLabel: { fontSize: 13.5, fontWeight: '800', letterSpacing: 0.8 },
  placeName: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  notes: { fontSize: 18, lineHeight: 26 },
  job: { fontSize: 15, lineHeight: 21 },
  done: { minHeight: TASK_SIZES.done, borderRadius: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md },
  doneText: { fontSize: 30, fontWeight: '900', letterSpacing: -0.4, flexShrink: 1 },
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TASK_SIZES.row, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  rowSub: { fontSize: 14.5, lineHeight: 20 },
  undo: { minHeight: TASK_SIZES.touch, borderRadius: TASK_SIZES.touch / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  undoText: { fontSize: 17, fontWeight: '800' },
  undoBar: { borderRadius: radius.xl, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  undoBarText: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  allDone: { borderRadius: radius.xl, borderWidth: 2, alignItems: 'center', gap: space.md, paddingVertical: space.xl, paddingHorizontal: space.lg },
  allDoneText: { fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
});
