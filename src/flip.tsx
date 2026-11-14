// The date and time sheet: it slides up from the bottom and looks like a flip clock, a rack of dark split tiles that roll up and down. Rolling a tile (or
// tapping the arrow over or under it) changes its number, with a tick in the hand for each one. What the wheels hold and what a roll means is
// src/lib/flip-core.ts. It is React Native's own scrolling and Animated: no native package.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { clampDay, dateOf, dateParts, dayLine, daysIn, FLIP_WORDS as W, HOURS, minuteItems, MONTHS, outOfRange, timeOf, timeParts, yearItems } from '@/lib/flip-core';
import { isoLocal, localNowHM } from '@/lib/dates';
import { feel } from '@/lib/haptics';
import { space, useTheme } from '@/theme';
import { Dots } from '@/dots';
import { Button } from '@/ui';

const TILE = 104;
const INK = '#F4F4F5', TILE_TOP = '#2B2B33', TILE_BOTTOM = '#1A1A20', BEZEL = '#09090C', HINGE = '#3D3D47';

// One tile of the rack. `index` is which of `items` shows; rolling it says so through `onIndex`.
function Wheel({ items, index, onIndex, caption, small }: { items: string[]; index: number; onIndex: (i: number) => void; caption: string; small?: boolean }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const at = useRef(index);   // where the wheel itself last said it was
  const last = items.length - 1;
  useEffect(() => {
    if (index === at.current) return;
    at.current = index;
    ref.current?.scrollTo({ y: index * TILE, animated: true });
  }, [index]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(last, Math.round(e.nativeEvent.contentOffset.y / TILE)));
    if (i === at.current) return;
    at.current = i; feel.pick(); onIndex(i);
  };
  const step = (by: number) => { const i = index + by; if (i >= 0 && i <= last) { feel.pick(); onIndex(i); } };
  return (
    <View style={styles.wheel} accessible accessibilityRole="adjustable" accessibilityLabel={caption} accessibilityValue={{ text: items[Math.min(index, last)] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <Text style={styles.caption}>{caption}</Text>
      <Pressable accessibilityLabel={`${caption} ${W.earlier}`} onPress={() => step(-1)} hitSlop={6} style={styles.arrow}><Ionicons name="chevron-up" size={20} color={index > 0 ? '#8B8B98' : '#33333B'} /></Pressable>
      <View>
        <View style={styles.tile}>
          <View style={styles.tileTop} />
          <ScrollView ref={ref} style={styles.roll} showsVerticalScrollIndicator={false} snapToInterval={TILE} decelerationRate="fast" scrollEventThrottle={16} nestedScrollEnabled overScrollMode="never"
            contentOffset={{ x: 0, y: index * TILE }} onLayout={() => ref.current?.scrollTo({ y: at.current * TILE, animated: false })} onScroll={onScroll}>
            {items.map(v => <View key={v} style={styles.face}><Text allowFontScaling={false} numberOfLines={1} style={[styles.digits, small && styles.digitsSmall]}>{v}</Text></View>)}
          </ScrollView>
          <View pointerEvents="none" style={styles.split} />
          <View pointerEvents="none" style={styles.splitLight} />
          <View pointerEvents="none" style={styles.shade} />
        </View>
        <View pointerEvents="none" style={[styles.hinge, { left: -4 }]} />
        <View pointerEvents="none" style={[styles.hinge, { right: -4 }]} />
      </View>
      <Pressable accessibilityLabel={`${caption} ${W.later}`} onPress={() => step(1)} hitSlop={6} style={styles.arrow}><Ionicons name="chevron-down" size={20} color={index < last ? '#8B8B98' : '#33333B'} /></Pressable>
    </View>
  );
}

// `value` is 'HH:MM' or 'YYYY-MM-DD' ('' opens on now, or today). `onSet` is given what was chosen; `onClose` is always called once the sheet has gone.
export function FlipSheet({ title, mode, value, min, max, step, onSet, onClose }: { title: string; mode: 'time' | 'date'; value: string; min?: string; max?: string; step?: number; onSet: (v: string) => void; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const today = isoLocal(new Date());
  const [time, setTime] = useState(() => timeParts(mode === 'time' ? value : '', step, localNowHM()));
  const [date, setDate] = useState(() => dateParts(clampDay(mode === 'date' && value ? value : today, min, max)));
  const years = useMemo(() => yearItems(today, min, max), [today, min, max]);
  const minutes = useMemo(() => minuteItems(step), [step]);
  const days = useMemo(() => Array.from({ length: daysIn(date.y, date.m) }, (_, i) => String(i + 1)), [date.y, date.m]);
  const rolled = dateOf(date.y, date.m, date.d), chosen = mode === 'date' ? clampDay(rolled, min, max) : timeOf(time.h, time.m, step);

  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 240, mass: 0.9 }).start(); }, [a]);
  const leave = (then?: () => void) => Animated.timing(a, { toValue: 0, duration: 170, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => { then?.(); onClose(); });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => leave()}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: a }]}><Pressable accessibilityLabel={W.close} style={StyleSheet.absoluteFill} onPress={() => leave()} /></Animated.View>
      <Animated.View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + space.lg, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }]}>
        <View style={[styles.grip, { backgroundColor: t.line }]} />
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: t.fg }]}>{title}</Text>
          {mode === 'time' ? <Dots text={chosen} size={22} color={t.accent2} /> : <Text style={[styles.readout, { color: t.accent2 }]}>{dayLine(chosen)}</Text>}
        </View>
        <View style={styles.rack}>
          {mode === 'time' ? (
            <>
              <Wheel caption={W.hour} items={HOURS} index={time.h} onIndex={h => setTime(v => ({ ...v, h }))} />
              <View style={styles.colon}><View style={styles.colonDot} /><View style={styles.colonDot} /></View>
              <Wheel caption={W.minute} items={minutes} index={time.m} onIndex={m => setTime(v => ({ ...v, m }))} />
            </>
          ) : (
            <>
              <Wheel caption={W.day} items={days} index={Math.min(date.d, days.length) - 1} onIndex={i => setDate(v => ({ ...v, d: i + 1 }))} />
              <Wheel caption={W.month} items={MONTHS} index={date.m} onIndex={m => setDate(v => ({ ...v, m }))} small />
              <Wheel caption={W.year} items={years.map(String)} index={Math.max(0, years.indexOf(date.y))} onIndex={i => setDate(v => ({ ...v, y: years[i] }))} small />
            </>
          )}
        </View>
        {mode === 'date' && !!outOfRange(rolled, min, max) && <Text style={[styles.note, { color: t.warn }]}>{outOfRange(rolled, min, max)}</Text>}
        <View style={styles.actions}>
          <View style={styles.side}><Button kind="plain" onPress={() => (mode === 'time' ? setTime(timeParts(localNowHM(), step, localNowHM())) : setDate(dateParts(clampDay(today, min, max))))}>{mode === 'time' ? W.now : W.today}</Button></View>
          <View style={styles.main}><Button icon="checkmark" onPress={() => leave(() => onSet(chosen))}>{W.set}</Button></View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: space.xl, paddingTop: 10, gap: space.lg },
  grip: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  readout: { fontSize: 15, fontWeight: '700' },
  rack: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BEZEL, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  wheel: { flex: 1, alignItems: 'stretch' },
  caption: { color: '#8B8B98', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.6, textAlign: 'center' },
  arrow: { height: 30, alignItems: 'center', justifyContent: 'center' },
  tile: { height: TILE, borderRadius: 14, overflow: 'hidden', backgroundColor: TILE_BOTTOM },
  tileTop: { position: 'absolute', left: 0, right: 0, top: 0, height: TILE / 2, backgroundColor: TILE_TOP },
  roll: { height: TILE },
  face: { height: TILE, alignItems: 'center', justifyContent: 'center' },
  digits: { color: INK, fontSize: 70, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'], includeFontPadding: false },
  digitsSmall: { fontSize: 38, letterSpacing: 0 },
  split: { position: 'absolute', left: 0, right: 0, top: TILE / 2 - 1, height: 2, backgroundColor: 'rgba(0,0,0,0.85)' },
  splitLight: { position: 'absolute', left: 0, right: 0, top: TILE / 2 + 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: TILE / 2 - 1, backgroundColor: 'rgba(0,0,0,0.16)' },
  hinge: { position: 'absolute', top: TILE / 2 - 9, width: 8, height: 18, borderRadius: 3, backgroundColor: HINGE },
  colon: { gap: 16, marginTop: 14 },
  colonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B8B98' },
  note: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  side: { flex: 1 },
  main: { flex: 2 },
});
