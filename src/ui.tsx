// The building blocks every screen uses, in the app's own colours and touch sizes: the screen itself (its way back and its title in a bar at the top, content
// that eases in, pull down to read again), headings, cards, rows with an icon, pills, figures, notices, boxes to type in and buttons that give under the thumb.
// The motion is React Native's own Animated, so nothing extra is loaded for it.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, space, TOUCH, useTheme } from '@/theme';
import { feel } from '@/lib/haptics';
import { useSessionMaybe } from '@/lib/session';

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

// Something that can be pressed gives a little under the thumb: it shrinks a touch while held and springs back.
export function Touch({ children, onPress, disabled, style, outer, scale = 0.97, ...rest }: { children: ReactNode; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; outer?: StyleProp<ViewStyle>; scale?: number } & Pick<PressableProps, 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityState' | 'hitSlop'>) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (x: number) => Animated.spring(v, { toValue: x, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  return (
    <Pressable {...rest} disabled={disabled} onPress={onPress} onPressIn={() => to(scale)} onPressOut={() => to(1)} style={outer}>
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// What a screen tells its own top bar (its title, shown there once the big one has scrolled away) and its buttons (one in a heading is a small one).
const ScreenCtx = createContext<{ setTitle: (s: string) => void } | null>(null);
const CompactCtx = createContext(false);
// Inside a card, a card is a quieter panel and a heading a smaller one.
const InCardCtx = createContext(false);
// On a hero (a panel in the app's own colour) everything is drawn in white on it.
const OnHeroCtx = createContext(false);
const WHITE = '#FFFFFF', WHITE_SOFT = 'rgba(255,255,255,0.80)', WHITE_WASH = 'rgba(255,255,255,0.18)';
const wordsOf = (children: ReactNode): string => typeof children === 'string' || typeof children === 'number' ? String(children) : Array.isArray(children) ? children.map(wordsOf).join('') : '';

// A screen. Its content eases in; pulling it down reads everything again; and once the big title has scrolled away the title sits in a bar at the top.
// One opened over the tabs has its way back in that bar; `centered` is for the few that say one thing (signed out, sent, saved).
export function Screen({ children, centered }: { children: ReactNode; centered?: boolean }) {
  const t = useTheme();
  const session = useSessionMaybe();
  const segments = useSegments() as string[];
  const back = !centered && segments[0] !== '(tabs)' && segments[0] !== 'sign-in' && router.canGoBack();
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const y = useRef(new Animated.Value(0)).current, enter = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(enter, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [enter]);
  const ctx = useMemo(() => ({ setTitle }), []);
  const shown = y.interpolate({ inputRange: [24, 56], outputRange: [0, 1], extrapolate: 'clamp' });
  const canRefresh = !centered && session?.state.status === 'signedIn';
  const refresh = () => {
    if (!session) return;
    setRefreshing(true); session.changed(true);
    setTimeout(() => setRefreshing(false), 700);
  };
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <Glow />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenCtx.Provider value={ctx}>
          <Animated.ScrollView contentContainerStyle={[styles.screen, back && styles.under, centered && styles.centered, segments[0] === '(tabs)' && styles.overTabs]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
            refreshControl={canRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent2} colors={[t.accent]} progressBackgroundColor={t.surface2} progressViewOffset={back ? BAR : 0} /> : undefined}>
            <Animated.View style={[styles.content, centered && styles.centered, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>
          </Animated.ScrollView>
        </ScreenCtx.Provider>
        {!centered && (
          <View pointerEvents="box-none" style={styles.bar}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.topbar, borderBottomColor: t.line, borderBottomWidth: StyleSheet.hairlineWidth, opacity: shown }]} />
            {back && (
              <Touch accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} scale={0.9} onPress={() => { feel.pick(); router.back(); }} outer={styles.backAt} style={[styles.back, { backgroundColor: t.surface2 }]}>
                <Ionicons name="chevron-back" size={22} color={t.fg} />
              </Touch>
            )}
            <Animated.Text numberOfLines={1} style={[styles.barTitle, { color: t.fg, opacity: shown }]}>{title}</Animated.Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
// A soft light in the app's own colours behind the top of every screen. Rings of the same colour laid over each other, since nothing here can blur.
function Glow() {
  const t = useTheme();
  const rings = (size: number, colour: string, style: ViewStyle) => (
    <View pointerEvents="none" style={[styles.glow, { width: size, height: size }, style]}>
      {Array.from({ length: 18 }, (_, i) => 1 - i / 18).map(k => <View key={k} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: size, backgroundColor: colour }} />)}
    </View>
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {rings(520, wash(t.accent, 0.014), { top: -260, right: -190 })}
      {rings(400, wash(t.tintViolet, 0.011), { top: -140, left: -220 })}
    </View>
  );
}
export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  const ctx = useContext(ScreenCtx), words = wordsOf(children), onHero = useContext(OnHeroCtx);
  useEffect(() => { if (!onHero) ctx?.setTitle(words); }, [ctx, words, onHero]);
  return <Text accessibilityRole="header" style={[styles.title, { color: onHero ? WHITE : t.fg }]}>{children}</Text>;
}
// The one big figure on a screen (the time on the clock).
export function Display({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.display, { color: useContext(OnHeroCtx) ? WHITE : t.fg }]}>{children}</Text>;
}
// The panel that leads a screen, in the app's own colour (or green for something under way), with everything on it in white.
export function Hero({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'ok' }) {
  const t = useTheme();
  const base = tone === 'ok' ? '#15803D' : t.accent;
  return (
    <View style={[styles.heroShadow, { shadowColor: base }]}>
      <View style={[styles.hero, { backgroundColor: base }]}>
        <View pointerEvents="none" style={[styles.heroBlob, { width: 260, height: 260, top: -120, right: -80, backgroundColor: 'rgba(255,255,255,0.13)' }]} />
        <View pointerEvents="none" style={[styles.heroBlob, { width: 200, height: 200, bottom: -110, left: -60, backgroundColor: 'rgba(0,0,0,0.12)' }]} />
        <OnHeroCtx.Provider value={true}>{children}</OnHeroCtx.Provider>
      </View>
    </View>
  );
}
// The heading over a group of rows or cards. A button beside it is a small one.
export function Heading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  const inCard = useContext(InCardCtx);
  return (
    <View style={[styles.heading, inCard && styles.headingIn]}>
      <Text accessibilityRole="header" style={[styles.headingText, inCard && styles.headingInText, { color: inCard ? t.muted : t.fg }]}>{children}</Text>
      {!!right && <CompactCtx.Provider value={true}>{right}</CompactCtx.Provider>}
    </View>
  );
}
export function Body({ children, tone = 'fg', strong }: { children: ReactNode; tone?: 'fg' | 'muted' | 'danger' | 'ok'; strong?: boolean }) {
  const t = useTheme();
  const onHero = useContext(OnHeroCtx);
  return <Text style={[styles.body, strong && styles.strong, { color: onHero ? (tone === 'muted' ? WHITE_SOFT : WHITE) : t[tone] }]}>{children}</Text>;
}
export function Card({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const t = useTheme();
  const inCard = useContext(InCardCtx);
  if (inCard) return <View style={[styles.cardIn, flush && styles.flush, { backgroundColor: t.surface2 }]}>{children}</View>;
  return <InCardCtx.Provider value={true}><View style={[styles.card, flush && styles.flush, { backgroundColor: t.surface, borderColor: t.line2 }]}>{children}</View></InCardCtx.Provider>;
}
// Where something stands, as a small coloured label.
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const c = toneOf(useTheme(), tone), onHero = useContext(OnHeroCtx);
  return <View style={[styles.pill, { backgroundColor: onHero ? WHITE_WASH : c.bg }]}><Text style={[styles.pillText, { color: onHero ? WHITE : c.fg }]}>{children}</Text></View>;
}
// A line in a list: an icon on its own colour, what it is, a line under it, and what is on the right (a pill, a figure, or the arrow that says it opens).
export function Row({ icon, tint = 'blue', title, sub, right, onPress, danger, last }: { icon?: IconName; tint?: Tint; title: string; sub?: string | null; right?: ReactNode; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const t = useTheme();
  const c = tintOf(t, tint);
  const inner = (
    <View style={styles.row}>
      {!last && <View style={[styles.rowLine, { left: icon ? space.lg + 42 + space.md : space.lg, backgroundColor: t.line }]} />}
      {icon && <View style={[styles.rowIcon, { backgroundColor: danger ? t.danger : c.fg }]}><Ionicons name={icon} size={21} color={t.bg} /></View>}
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: danger ? t.danger : t.fg }]}>{title}</Text>
        {!!sub && <Text numberOfLines={2} style={[styles.rowSub, { color: t.muted }]}>{sub}</Text>}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={17} color={t.dim} style={styles.rowArrow} />}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title} onPress={() => { feel.pick(); onPress(); }} style={({ pressed }) => pressed && { backgroundColor: t.surface2 }}>{inner}</Pressable>;
}
// Rows kept together in one card.
export function List({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.list, { backgroundColor: t.surface, borderColor: t.line2 }]}>{children}</View>;
}
// A row of figures: what it counts, the figure, and a line under it.
export type Figure = { key: string; label: string; value: string | number; sub?: string; tone?: 'warn' | 'ok' | 'danger' };
export function Figures({ figures }: { figures: Figure[] }) {
  const t = useTheme();
  return (
    <View style={styles.figures}>
      {figures.map(f => (
        <View key={f.key} style={[styles.figure, { backgroundColor: t.surface, borderColor: t.line2 }]}>
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
  const onHero = useContext(OnHeroCtx);
  const c = onHero ? { fg: WHITE, bg: 'rgba(0,0,0,0.22)' } : toneOf(useTheme(), tone);
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
      <View style={[styles.emptyIcon, { backgroundColor: t.surface }]}><Ionicons name={icon} size={28} color={t.dim} /></View>
      <Text style={[styles.emptyText, { color: t.muted }]}>{children}</Text>
    </View>
  );
}
// A box to type in. It lights up in the app's colour while it is being typed in.
export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: focused ? t.accent2 : t.muted }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.dim} selectionColor={t.accent2} {...input}
        onFocus={e => { setFocused(true); input.onFocus?.(e); }} onBlur={e => { setFocused(false); input.onBlur?.(e); }}
        style={[styles.input, input.multiline && styles.multiline, { color: t.fg, backgroundColor: t.surface2, borderColor: focused ? t.accent : 'transparent' }]} />
    </View>
  );
}
// A button. The main one is filled in the app's colour; a plain one is quieter; one beside a heading is a small one.
export function Button({ children, onPress, kind = 'primary', busy, disabled, icon }: { children: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; busy?: boolean; disabled?: boolean; icon?: IconName }) {
  const t = useTheme();
  const compact = useContext(CompactCtx);
  const off = !!busy || !!disabled;
  const onHero = useContext(OnHeroCtx);
  const fg = onHero ? (kind === 'primary' ? t.bg : WHITE) : kind === 'primary' ? WHITE : kind === 'danger' ? t.danger : compact ? t.accent2 : t.fg;
  const bg = onHero ? (kind === 'primary' ? WHITE : WHITE_WASH) : kind === 'primary' ? t.accent : kind === 'danger' ? wash(t.danger, 0.14) : compact ? wash(t.accent, 0.16) : t.surface2;
  return (
    <Touch accessibilityRole="button" accessibilityState={{ disabled: off, busy: !!busy }} disabled={off} onPress={() => { feel.tap(); onPress(); }}
      style={[compact ? styles.buttonSmall : styles.button, kind !== 'primary' && !compact && styles.buttonQuiet, kind === 'primary' && !compact && !onHero && !off && [styles.buttonGlow, { shadowColor: t.accent }], { backgroundColor: bg }, off && styles.dim]}>
      {busy ? <ActivityIndicator color={fg} size={compact ? 'small' : undefined} /> : (
        <View style={styles.buttonIn}>
          {icon && <Ionicons name={icon} size={compact ? 15 : 19} color={fg} />}
          <Text numberOfLines={1} style={[compact ? styles.buttonSmallText : styles.buttonText, { color: fg }]}>{children}</Text>
        </View>
      )}
    </Touch>
  );
}
// One of a few choices, side by side: the chosen one is filled in its colour (the accent, or green, amber or red when the choice itself is good, a caution or bad).
export function Choice<T extends string>({ options, value, onChange, disabled }: { options: { key: T; label: string; tone?: Tone }[]; value: T | '' | undefined; onChange: (v: T) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.choice, { backgroundColor: t.surface2 }]}>
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
// While a screen is being read: the shape of what is coming, breathing, where a spinner would be.
export function Loading() {
  const t = useTheme();
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const block = (h: number, w: number | `${number}%` = '100%') => <View style={{ height: h, width: w, borderRadius: h > 40 ? 20 : 10, backgroundColor: t.surface }} />;
  return (
    <SafeAreaView accessibilityLabel="Loading" style={[styles.fill, { backgroundColor: t.bg }]}>
      <Animated.View style={[styles.screen, { opacity: v }]}>
        {block(30, '55%')}
        {block(120)}
        {block(18, '35%')}
        {block(190)}
        {block(72)}
      </Animated.View>
    </SafeAreaView>
  );
}
// A person's initials on a colour, where a photo would go.
export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accent, borderWidth: 2, borderColor: wash(t.accent2, 0.55), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: size * 0.38, fontWeight: '800' }}>{initials}</Text></View>;
}

const BAR = 52;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: BAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  backAt: { position: 'absolute', left: 14, top: 6 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontSize: 17, fontWeight: '700', maxWidth: '64%' },
  screen: { paddingHorizontal: 20, paddingTop: space.xl, paddingBottom: space.xxl, flexGrow: 1 },
  content: { gap: space.lg, flexGrow: 1 },
  under: { paddingTop: BAR + space.sm },
  centered: { justifyContent: 'center' },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -1.1, lineHeight: 41 },
  display: { fontSize: 60, fontWeight: '900', letterSpacing: -2.5, lineHeight: 64 },
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  heroShadow: { borderRadius: 30, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  hero: { borderRadius: 30, padding: 22, gap: space.md, overflow: 'hidden' },
  heroBlob: { position: 'absolute', borderRadius: 999 },
  overTabs: { paddingBottom: 124 },
  buttonGlow: { shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.md, marginBottom: -space.xs, minHeight: 34 },
  headingText: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  body: { fontSize: 16, lineHeight: 23 },
  strong: { fontWeight: '600' },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  cardIn: { borderRadius: radius.lg, padding: 14, gap: space.sm },
  headingIn: { marginTop: space.xs, minHeight: 0 },
  headingInText: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.2 },
  flush: { padding: 0, gap: 0, overflow: 'hidden' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.1 },
  list: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowLine: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowArrow: { marginRight: -4 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  rowSub: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  figure: { flexBasis: '46%', flexGrow: 1, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.lg, gap: 3 },
  figureLabel: { fontSize: 13, fontWeight: '600' },
  figureValue: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  figureSub: { fontSize: 12.5, lineHeight: 17 },
  notice: { flexDirection: 'row', gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: 14 },
  noticeIcon: { marginTop: 1 },
  noticeText: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  empty: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15.5, lineHeight: 22, textAlign: 'center', maxWidth: 290 },
  field: { gap: 7 },
  label: { fontSize: 13.5, fontWeight: '600', marginLeft: 4 },
  input: { minHeight: 54, borderRadius: radius.lg, borderWidth: 1.5, paddingHorizontal: space.lg, fontSize: 17 },
  multiline: { minHeight: 104, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  choice: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg },
  choiceItem: { flex: 1, minHeight: TOUCH, borderRadius: radius.lg - 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  choiceText: { fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  buttonQuiet: { minHeight: 50, borderRadius: 25 },
  buttonSmall: { minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  buttonIn: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  buttonSmallText: { fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.5 },
});
