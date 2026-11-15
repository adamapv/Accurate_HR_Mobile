// A slider for a whole number, drawn and dragged in plain React Native (no native package): a track with a thumb, a button at each end for one step, and a tick in the hand
// each five. It is the web Field view's share slider, for how a card's time is shared across cost centres. Whatever the finger does, the value is a whole number between
// `min` and `max`, and what it means is the caller's.
import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { feel } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Touch } from '@/ui';

const THUMB = 30;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function Slider({ value, onChange, min = 1, max = 99, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  // The latest of everything the gesture reads, kept in a ref: the responder is made once per width.
  const live = useRef({ value, onChange, min, max, width });
  live.current = { value, onChange, min, max, width };
  const startX = useRef(0);
  const set = (n: number) => {
    const { value: now, onChange: say, min: lo, max: hi } = live.current;
    const next = clamp(Math.round(n), lo, hi);
    if (next === now) return;
    if (next % 5 === 0) feel.pick();
    say(next);
  };
  const fromX = (x: number) => { const { min: lo, max: hi, width: w } = live.current; return w > THUMB ? lo + clamp((x - THUMB / 2) / (w - THUMB), 0, 1) * (hi - lo) : lo; };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,   // a screen that scrolls does not take the drag from the thumb
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: e => { startX.current = e.nativeEvent.locationX; set(fromX(startX.current)); },
    onPanResponderMove: (_, g) => set(fromX(startX.current + g.dx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const frac = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const left = frac * Math.max(0, width - THUMB);
  return (
    <View style={styles.row}>
      <Touch accessibilityRole="button" accessibilityLabel={`${label}: one less`} onPress={() => set(value - 1)} style={[styles.step, { backgroundColor: t.surface2 }]}><Ionicons name="remove" size={20} color={t.fg} /></Touch>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => set(value + (e.nativeEvent.actionName === 'increment' ? 5 : -5))}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.hit} {...pan.panHandlers}>
        <View pointerEvents="none" style={[styles.track, { backgroundColor: t.surface2 }]} />
        <View pointerEvents="none" style={[styles.fill, { width: left, backgroundColor: t.accent }]} />
        <View pointerEvents="none" style={[styles.thumb, { left, backgroundColor: t.accent, borderColor: t.surface }]} />
      </View>
      <Touch accessibilityRole="button" accessibilityLabel={`${label}: one more`} onPress={() => set(value + 1)} style={[styles.step, { backgroundColor: t.surface2 }]}><Ionicons name="add" size={20} color={t.fg} /></Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hit: { flex: 1, height: 44, justifyContent: 'center' },
  track: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 8, borderRadius: 4 },
  fill: { position: 'absolute', left: THUMB / 2, height: 8, borderRadius: 4, opacity: 0.9 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
});
