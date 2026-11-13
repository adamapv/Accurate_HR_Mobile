// The building blocks every screen uses, in the app's own colours and touch sizes: the screen itself (with its way back), headings, cards, rows with an icon, pills,
// figures, notices, boxes to type in and buttons.
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, space, TOUCH, useTheme } from '@/theme';
import { feel } from '@/lib/haptics';

export type IconName = keyof typeof Ionicons.glyphMap;
export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
export type Tint = 'blue' | 'amber' | 'violet' | 'teal' | 'pink' | 'slate' | 'orange' | 'green';
type Theme = ReturnType<typeof useTheme>;

// A colour at part strength, for the wash behind an icon or a pill.
const wash = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
const TINTS: Record<Tint, keyof Theme> = { blue: 'tintBlue', amber: 'tintAmber', violet: 'tintViolet', teal: 'tintTeal', pink: 'tintPink', slate: 'tintSlate', orange: 'tintOrange', green: 'tintGreen' };
const tintOf = (t: Theme, tint: Tint) => { const fg = t[TINTS[tint]] as string; return { fg, bg: wash(fg, 0.16) }; };
const toneOf = (t: Theme, tone: Tone) => { const fg = tone === 'ok' ? t.ok : tone === 'warn' ? t.warn : tone === 'danger' ? t.danger : tone === 'info' ? t.accent2 : t.muted; return { fg, bg: wash(fg, tone === 'neutral' ? 0.14 : 0.16) }; };

// A screen. One opened over the tabs has its way back at the top; `centered` is for the few that say one thing (signed out, sent, saved).
export function Screen({ children, centered }: { children: ReactNode; centered?: boolean }) {
  const t = useTheme();
  const segments = useSegments() as string[];
  const back = !centered && segments[0] !== '(tabs)' && segments[0] !== 'sign-in' && router.canGoBack();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {back && (
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
              <Ionicons name="chevron-back" size={22} color={t.accent2} />
              <Text style={[styles.backText, { color: t.accent2 }]}>Back</Text>
            </Pressable>
          </View>
        )}
        <ScrollView contentContainerStyle={[styles.screen, back && styles.under, centered && styles.centered]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={[styles.title, { color: t.fg }]}>{children}</Text>;
}
// The small heading over a group of rows or cards.
export function Heading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[styles.headingText, { color: t.dim }]}>{children}</Text>
      {right}
    </View>
  );
}
export function Body({ children, tone = 'fg', strong }: { children: ReactNode; tone?: 'fg' | 'muted' | 'danger' | 'ok'; strong?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.body, strong && styles.strong, { color: t[tone] }]}>{children}</Text>;
}
export function Card({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const t = useTheme();
  return <View style={[styles.card, flush && styles.flush, { backgroundColor: t.surface, borderColor: t.line }]}>{children}</View>;
}
// Where something stands, as a small coloured label.
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const c = toneOf(useTheme(), tone);
  return <View style={[styles.pill, { backgroundColor: c.bg }]}><Text style={[styles.pillText, { color: c.fg }]}>{children}</Text></View>;
}
// A line in a list: an icon on its own colour, what it is, a line under it, and what is on the right (a pill, a figure, or the arrow that says it opens).
export function Row({ icon, tint = 'blue', title, sub, right, onPress, danger, last }: { icon?: IconName; tint?: Tint; title: string; sub?: string | null; right?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const t = useTheme();
  const c = tintOf(t, tint);
  const inner = (
    <View style={[styles.row, !last && { borderBottomColor: t.line2, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {icon && <View style={[styles.rowIcon, { backgroundColor: danger ? wash(t.danger, 0.16) : c.bg }]}><Ionicons name={icon} size={18} color={danger ? t.danger : c.fg} /></View>}
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: danger ? t.danger : t.fg }]}>{title}</Text>
        {!!sub && <Text numberOfLines={2} style={[styles.rowSub, { color: t.muted }]}>{sub}</Text>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={t.dim} />}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title} onPress={() => { feel.pick(); onPress(); }} style={({ pressed }) => pressed && { backgroundColor: t.surface2 }}>{inner}</Pressable>;
}
// Rows kept together in one card.
export function List({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.list, { backgroundColor: t.surface, borderColor: t.line }]}>{children}</View>;
}
// A row of figures: what it counts, the figure, and a line under it.
export type Figure = { key: string; label: string; value: string | number; sub?: string; tone?: 'warn' | 'ok' | 'danger' };
export function Figures({ figures }: { figures: Figure[] }) {
  const t = useTheme();
  return (
    <View style={styles.figures}>
      {figures.map(f => (
        <View key={f.key} style={[styles.figure, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Text numberOfLines={1} style={[styles.figureLabel, { color: t.muted }]}>{f.label}</Text>
          <Text numberOfLines={1} style={[styles.figureValue, { color: f.tone === 'warn' ? t.warn : f.tone === 'danger' ? t.danger : f.tone === 'ok' ? t.ok : t.fg }]}>{String(f.value)}</Text>
          {!!f.sub && <Text numberOfLines={2} style={[styles.figureSub, { color: t.dim }]}>{f.sub}</Text>}
        </View>
      ))}
    </View>
  );
}
// Something the person should read, on its own colour: a warning, what to do next, that something was saved.
export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: Tone; icon?: IconName }) {
  const c = toneOf(useTheme(), tone);
  const name: IconName = icon || (tone === 'ok' ? 'checkmark-circle' : tone === 'danger' ? 'alert-circle' : tone === 'warn' ? 'warning' : 'information-circle');
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }]}>
      <Ionicons name={name} size={18} color={c.fg} style={styles.noticeIcon} />
      <View style={styles.rowText}>{typeof children === 'string' ? <Text style={[styles.noticeText, { color: c.fg }]}>{children}</Text> : children}</View>
    </View>
  );
}
// What is said where a list has nothing in it.
export function Empty({ children, icon = 'file-tray-outline' }: { children: ReactNode; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.surface2 }]}><Ionicons name={icon} size={22} color={t.dim} /></View>
      <Text style={[styles.emptyText, { color: t.muted }]}>{children}</Text>
    </View>
  );
}
export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.dim} {...input}
        style={[styles.input, input.multiline && styles.multiline, { color: t.fg, backgroundColor: t.surface2, borderColor: t.line }]} />
    </View>
  );
}
export function Button({ children, onPress, kind = 'primary', busy, disabled, icon }: { children: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; busy?: boolean; disabled?: boolean; icon?: IconName }) {
  const t = useTheme();
  const off = !!busy || !!disabled;
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? t.danger : t.fg;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy: !!busy }} disabled={off} onPress={() => { feel.tap(); onPress(); }}
      style={({ pressed }) => [styles.button, kind === 'primary' ? { backgroundColor: t.accent } : { backgroundColor: t.surface2, borderColor: kind === 'danger' ? wash(t.danger, 0.4) : t.line, borderWidth: 1 }, (pressed || off) && styles.dim]}>
      {busy ? <ActivityIndicator color={fg} /> : (
        <View style={styles.buttonIn}>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}
// One of a few choices, side by side: the chosen one is filled in its colour (the accent, or green, amber or red when the choice itself is good, a caution or bad).
export function Choice<T extends string>({ options, value, onChange, disabled }: { options: { key: T; label: string; tone?: Tone }[]; value: T | '' | undefined; onChange: (v: T) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.choice, { backgroundColor: t.surface2, borderColor: t.line }]}>
      {options.map(o => {
        const on = o.key === value, c = on && o.tone && o.tone !== 'info' && o.tone !== 'neutral' ? toneOf(t, o.tone) : null;
        return (
          <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !!disabled }} accessibilityLabel={o.label} disabled={disabled} onPress={() => { if (!on) feel.pick(); onChange(o.key); }}
            style={({ pressed }) => [styles.choiceItem, on && { backgroundColor: c ? c.bg : t.accent }, pressed && styles.dim]}>
            <Text numberOfLines={2} style={[styles.choiceText, { color: on ? (c ? c.fg : '#FFFFFF') : t.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
// A yes-or-no switch, in the app's colours.
export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string; disabled?: boolean }) {
  const t = useTheme();
  return <Switch accessibilityLabel={accessibilityLabel} value={value} onValueChange={v => { feel.pick(); onValueChange(v); }} disabled={disabled} trackColor={{ false: t.surface2, true: t.accent }} thumbColor="#FFFFFF" ios_backgroundColor={t.surface2} />;
}
// Something was refused or went wrong: said in red, and felt once each time the words change.
export function Problem({ children }: { children: ReactNode }) {
  const words = typeof children === 'string' ? children : children ? 'x' : '';
  useEffect(() => { if (words) feel.refused(); }, [words]);
  if (!children) return null;
  return <View accessibilityRole="alert"><Notice tone="danger">{children}</Notice></View>;
}
export function Loading() {
  const t = useTheme();
  return <View style={[styles.fill, styles.centered, { backgroundColor: t.bg }]}><ActivityIndicator color={t.accent} size="large" /></View>;
}
// A person's initials on a colour, where a photo would go.
export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: size * 0.38, fontWeight: '700' }}>{initials}</Text></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { height: TOUCH, paddingHorizontal: space.md, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: TOUCH, paddingRight: space.md },
  backText: { fontSize: 17, fontWeight: '500' },
  screen: { padding: space.xl, gap: space.lg, flexGrow: 1 },
  under: { paddingTop: space.xs },
  centered: { justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, marginBottom: -space.sm },
  headingText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { fontSize: 16, lineHeight: 23 },
  strong: { fontWeight: '600' },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  flush: { padding: 0, gap: 0, overflow: 'hidden' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  list: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH + 12, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13.5, lineHeight: 19, marginTop: 1 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  figure: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.md, gap: 2 },
  figureLabel: { fontSize: 12.5, fontWeight: '600' },
  figureValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  figureSub: { fontSize: 12.5, lineHeight: 17 },
  notice: { flexDirection: 'row', gap: space.sm, borderRadius: radius.md, padding: space.md },
  noticeIcon: { marginTop: 2 },
  noticeText: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 280 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { minHeight: TOUCH + 6, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 17 },
  multiline: { minHeight: 96, paddingTop: space.md, paddingBottom: space.md, textAlignVertical: 'top' },
  choice: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, borderWidth: 1 },
  choiceItem: { flex: 1, minHeight: TOUCH, borderRadius: radius.md - 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  choiceText: { fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: TOUCH + 6, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonIn: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 16.5, fontWeight: '700' },
  dim: { opacity: 0.6 },
});
