// The app's date and time boxes (the phone's own picker) and its searchable list, for a long list of jobs or cost centres.
import { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fmtDate, isoLocal, parseDay } from '@/lib/dates';
import { radius, space, TOUCH, useTheme } from '@/theme';
import { feel } from '@/lib/haptics';

const pad2 = (n: number) => String(n).padStart(2, '0');
const atTime = (hm: string) => { const [h, m] = (hm || '07:00').split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d; };

// A time ('HH:MM', or '' for none) or a date ('YYYY-MM-DD'). `maxDate` stops a date after it and `minDate` one before it. `step` snaps a time to that many minutes.
export function WhenField({ label, mode, value, onChange, maxDate, minDate, step, placeholder }: { label: string; mode: 'time' | 'date'; value: string; onChange: (v: string) => void; maxDate?: string; minDate?: string; step?: number; placeholder?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const shown = !value ? placeholder || 'Choose' : mode === 'date' ? fmtDate(value) : value;
  const take = (d: Date) => {
    if (mode === 'date') return onChange(isoLocal(d));
    let mins = d.getHours() * 60 + d.getMinutes();
    if (step) mins = (Math.round(mins / step) * step) % 1440;
    onChange(`${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`);
  };
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${shown}`} onPress={() => setOpen(true)} style={[styles.box, { backgroundColor: t.surface2, borderColor: t.line }]}>
        <Text style={[styles.value, { color: value ? t.fg : t.dim }]}>{shown}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          mode={mode} value={mode === 'date' ? parseDay(value || isoLocal(new Date())) : atTime(value)} is24Hour
          maximumDate={mode === 'date' && maxDate ? parseDay(maxDate) : undefined}
          minimumDate={mode === 'date' && minDate ? parseDay(minDate) : undefined}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'} themeVariant="dark"
          onValueChange={(_e, d) => { if (Platform.OS !== 'ios') setOpen(false); take(d); }}
          onDismiss={() => setOpen(false)} />
      )}
      {open && Platform.OS === 'ios' && <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}><Text style={[styles.value, { color: t.accent2 }]}>Done</Text></Pressable>}
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
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} onPress={() => { setQuery(''); setOpen(true); }} style={[styles.box, { backgroundColor: t.surface2, borderColor: t.line }]}>
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
  field: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '600' },
  box: { minHeight: TOUCH + 4, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, justifyContent: 'center' },
  value: { fontSize: 17 },
  detail: { fontSize: 14, marginTop: 2 },
  done: { minHeight: TOUCH, justifyContent: 'center', alignItems: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.md },
  title: { fontSize: 22, fontWeight: '700' },
  close: { minHeight: TOUCH, justifyContent: 'center' },
  search: { minHeight: TOUCH + 4, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 17, marginHorizontal: space.xl, marginVertical: space.md },
  row: { minHeight: TOUCH + 8, paddingHorizontal: space.xl, paddingVertical: space.md, justifyContent: 'center', borderBottomWidth: 1 },
  empty: { padding: space.xl, fontSize: 16 },
});
