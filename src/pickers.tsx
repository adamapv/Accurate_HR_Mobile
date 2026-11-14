// The app's date and time boxes (they open the flip-clock sheet) and its searchable lists, for a long list of jobs or cost centres.
import { useState } from 'react';
import { FlatList, Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fmtDate } from '@/lib/dates';
import { radius, space, TOUCH, useTheme } from '@/theme';
import { feel } from '@/lib/haptics';
import { Dots } from '@/dots';
import { FlipSheet } from '@/flip';
import { Touch } from '@/ui';

// A time ('HH:MM', or '' for none) or a date ('YYYY-MM-DD'). `maxDate` stops a date after it and `minDate` one before it. `step` snaps a time to that many minutes.
// The box opens the flip-clock sheet (src/flip.tsx); a time is shown in dots.
export function WhenField({ label, mode, value, onChange, maxDate, minDate, step, placeholder }: { label: string; mode: 'time' | 'date'; value: string; onChange: (v: string) => void; maxDate?: string; minDate?: string; step?: number; placeholder?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const shown = !value ? placeholder || 'Choose' : mode === 'date' ? fmtDate(value) : value;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Touch accessibilityRole="button" accessibilityLabel={`${label}: ${shown}`} onPress={() => { feel.tap(); setOpen(true); }} style={[styles.box, styles.when, { backgroundColor: t.surface2 }]}>
        {value && mode === 'time' ? <View style={styles.grow}><Dots text={value} size={20} color={t.fg} /></View> : <Text numberOfLines={1} style={[styles.value, styles.grow, { color: value ? t.fg : t.dim }]}>{shown}</Text>}
        <Ionicons name={mode === 'time' ? 'time-outline' : 'calendar-clear-outline'} size={19} color={t.dim} />
      </Touch>
      {open && <FlipSheet title={label} mode={mode} value={value} min={minDate} max={maxDate} step={step} onSet={onChange} onClose={() => setOpen(false)} />}
    </View>
  );
}

// One line of a list to choose from: what it is, a line under it, a small tag (a closed job), and a star when the list has them.
export type PickRow = { key: string; title: string; meta?: string | null; tag?: string; disabled?: boolean; star?: boolean };
export type PickGroup = { key: string; title: string | null; rows: PickRow[] };
// A full-screen list under headings, narrowed as the person types by `groupsFor` (the caller's rule). A row with a star has it on the right; pressing the
// star keeps the list open.
export function PickSheet({ title, hint, groupsFor, footerFor, empty, onPick, onStar, onClose }: { title: string; hint?: string; groupsFor: (query: string) => PickGroup[]; footerFor?: (query: string) => string; empty: string;
  onPick: (key: string) => void; onStar?: (key: string, on: boolean) => void; onClose: () => void }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const sections = groupsFor(query).filter(g => g.rows.length).map(g => ({ key: g.key, title: g.title, data: g.rows }));
  const footer = footerFor?.(query) || '';
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: t.fg }]}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={[styles.value, { color: t.accent2 }]}>Cancel</Text></Pressable>
        </View>
        <View style={[styles.searchBox, { backgroundColor: t.surface2 }]}>
          <Ionicons name="search" size={18} color={t.dim} />
          <TextInput accessibilityLabel="Search" placeholder={hint || 'Search'} placeholderTextColor={t.dim} value={query} onChangeText={setQuery} autoCorrect={false} style={[styles.searchInput, { color: t.fg }]} />
        </View>
        <SectionList sections={sections} keyExtractor={r => r.key} keyboardShouldPersistTaps="handled" stickySectionHeadersEnabled={false}
          ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>{query.trim() ? 'Nothing matches.' : empty}</Text>}
          ListFooterComponent={footer ? <Text style={[styles.empty, { color: t.muted }]}>{footer}</Text> : undefined}
          renderSectionHeader={({ section }) => (section.title ? <Text accessibilityRole="header" style={[styles.group, { color: section.key === 'star' || section.key === 'sched' ? t.accent2 : t.muted }]}>{section.title.toUpperCase()}</Text> : null)}
          renderItem={({ item }) => (
            <View style={[styles.pickRow, { borderBottomColor: t.line2 }]}>
              <Pressable accessibilityRole="button" disabled={item.disabled} onPress={() => { feel.pick(); onClose(); onPick(item.key); }} style={styles.pickMain}>
                <View style={styles.pickTitle}>
                  <Text style={[styles.value, styles.shrink, { color: item.disabled ? t.dim : t.fg }]}>{item.title}</Text>
                  {!!item.tag && <View style={[styles.tag, { backgroundColor: t.surface2 }]}><Text style={[styles.tagText, { color: t.muted }]}>{item.tag}</Text></View>}
                </View>
                {!!item.meta && <Text numberOfLines={1} style={[styles.detail, { color: t.muted }]}>{item.meta}</Text>}
              </Pressable>
              {onStar && item.star !== undefined && !item.disabled && (
                <Pressable accessibilityRole="button" accessibilityLabel={item.star ? `Take the star off ${item.title}` : `Star ${item.title}`} accessibilityState={{ selected: item.star }} hitSlop={8}
                  onPress={() => { feel.pick(); onStar(item.key, !item.star); }} style={styles.star}>
                  <Ionicons name={item.star ? 'star' : 'star-outline'} size={22} color={item.star ? '#F5B301' : t.dim} />
                </Pressable>
              )}
            </View>
          )} />
      </SafeAreaView>
    </Modal>
  );
}
// The one-tap choices over a box: a word saying what they are, then a button each.
export function QuickPicks({ label, picks, onPick, strong }: { label: string; picks: { key: string; title: string }[]; onPick: (key: string) => void; strong?: boolean }) {
  const t = useTheme();
  if (!picks.length) return null;
  return (
    <View accessibilityRole="none" style={styles.quick}>
      <Text style={[styles.quickLabel, { color: t.muted }]}>{label}</Text>
      {picks.map(p => (
        <Touch key={p.key} accessibilityRole="button" accessibilityLabel={`${label} ${p.title}`} onPress={() => { feel.pick(); onPick(p.key); }} style={[styles.chip, { backgroundColor: strong ? t.accent : t.surface2 }]}>
          <Text numberOfLines={1} style={[styles.chipText, { color: strong ? '#FFFFFF' : t.fg }]}>{p.title}</Text>
        </Touch>
      ))}
    </View>
  );
}
// The box a PickSheet opens from.
export function PickBox({ label, value, meta, placeholder, onPress }: { label: string; value: string; meta?: string | null; placeholder: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Touch accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} onPress={() => { feel.tap(); onPress(); }} style={[styles.box, styles.when, { backgroundColor: t.surface2 }]}>
        <View style={styles.grow}>
          <Text numberOfLines={1} style={[styles.value, { color: value ? t.fg : t.dim }]}>{value || placeholder}</Text>
          {!!value && !!meta && <Text numberOfLines={1} style={[styles.detail, { color: t.muted }]}>{meta}</Text>}
        </View>
        <Ionicons name="chevron-down" size={18} color={t.dim} />
      </Touch>
    </View>
  );
}

export type Option<T> = { key: string; title: string; detail?: string; item: T };
// A box that opens a full-screen list to choose from, narrowed as the person types by `search` (the caller's rule).
export function ChooseField<T>({ label, value, placeholder, options, search, onChoose }: { label: string; value: string; placeholder: string; options: Option<T>[]; search?: (query: string) => Option<T>[]; onChoose: (item: T) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = search && query.trim() ? search(query) : options;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} onPress={() => { setQuery(''); setOpen(true); }} style={[styles.box, { backgroundColor: t.surface2 }]}>
        <Text numberOfLines={1} style={[styles.value, { color: value ? t.fg : t.dim }]}>{value || placeholder}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[styles.title, { color: t.fg }]}>{label}</Text>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.close}><Text style={[styles.value, { color: t.accent2 }]}>Cancel</Text></Pressable>
          </View>
          {search && <TextInput accessibilityLabel="Search" placeholder="Search" placeholderTextColor={t.dim} value={query} onChangeText={setQuery} autoCorrect={false}
            style={[styles.search, { color: t.fg, backgroundColor: t.surface2, borderColor: t.line }]} />}
          <FlatList data={list} keyExtractor={o => o.key} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>{query.trim() ? 'Nothing matches.' : 'Nothing to choose from.'}</Text>}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => { feel.pick(); setOpen(false); onChoose(item.item); }} style={[styles.row, { borderBottomColor: t.line2 }]}>
                <Text style={[styles.value, { color: t.fg }]}>{item.title}</Text>
                {!!item.detail && <Text numberOfLines={1} style={[styles.detail, { color: t.muted }]}>{item.detail}</Text>}
              </Pressable>
            )} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  field: { gap: 7 },
  label: { fontSize: 13.5, fontWeight: '600', marginLeft: 4 },
  box: { minHeight: 54, borderRadius: radius.lg, paddingHorizontal: space.lg, justifyContent: 'center' },
  value: { fontSize: 17 },
  detail: { fontSize: 14, marginTop: 2 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, borderRadius: 25, paddingHorizontal: space.lg, marginHorizontal: space.xl, marginVertical: space.md },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 0 },
  group: { fontSize: 12.5, fontWeight: '800', letterSpacing: 1.1, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: 6 },
  pickRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  pickMain: { flex: 1, minHeight: TOUCH + 8, paddingLeft: space.xl, paddingRight: space.md, paddingVertical: space.md, justifyContent: 'center' },
  pickTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '700' },
  star: { width: 56, minHeight: TOUCH + 8, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  quickLabel: { fontSize: 13.5, fontWeight: '600' },
  chip: { minHeight: 38, maxWidth: 260, borderRadius: 19, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 14.5, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.md },
  title: { fontSize: 22, fontWeight: '700' },
  close: { minHeight: TOUCH, justifyContent: 'center' },
  search: { minHeight: 50, borderRadius: 25, borderWidth: 0, paddingHorizontal: space.md, fontSize: 17, marginHorizontal: space.xl, marginVertical: space.md },
  row: { minHeight: TOUCH + 8, paddingHorizontal: space.xl, paddingVertical: space.md, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: space.xl, fontSize: 16 },
});
