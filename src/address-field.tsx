// A street-address box that searches as it is typed: pick a result and the street, suburb, state and postcode fill in (and where it is). The list is the Worker's
// answer (Google Places when its key is set, OpenStreetMap otherwise); with no answer, or a search that fails, it is an ordinary box. Only what the person types is
// searched: an address already saved, or filled in by a pick, never opens the list. When to search and how a pick fills the form are the web app's own rules
// (shared/field-core.js).
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ADDRESS_SEARCH, addressFill, addressPickPath, addressSearchPath, addressWanted } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { feel } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Field } from '@/ui';

type Item = { id: string; text: string; address?: Record<string, string>; location?: { lat: number; lng: number } };
const token = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function AddressField({ label, value, onChange, onPick, maxLength }: { label: string; value: string; onChange: (v: string) => void; onPick: (fill: Record<string, unknown>) => void; maxLength?: number }) {
  const { api } = useSession();
  const t = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const typed = useRef(false), skip = useRef(''), seq = useRef(0), session = useRef(token());
  useEffect(() => {
    if (!addressWanted(value, typed.current, skip.current)) { setItems([]); return; }
    const n = ++seq.current;
    const wait = setTimeout(async () => {
      try { const r = await api<{ results?: Item[] }>(addressSearchPath(value, session.current) as string); if (n === seq.current) setItems(r.results || []); }
      catch { if (n === seq.current) setItems([]); }
    }, ADDRESS_SEARCH.waitMs as number);
    return () => clearTimeout(wait);
  }, [value, api]);
  const choose = async (item: Item) => {
    seq.current++; setItems([]); feel.pick();
    let picked: { address?: Record<string, string>; location?: { lat: number; lng: number } } | null = null;
    if (!item.address) { try { picked = await api(addressPickPath(item.id, session.current) as string); } catch { picked = null; } }
    session.current = token();
    const fill = addressFill(item, picked) as Record<string, unknown> | null;
    if (!fill) return;
    skip.current = String(fill.address_line1 || ''); typed.current = false;
    onPick(fill);
  };
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={value} maxLength={maxLength} autoCorrect={false} onChangeText={v => { typed.current = true; onChange(v); }} />
      {items.length > 0 && (
        <View accessibilityRole="list" style={{ borderRadius: 16, backgroundColor: t.surface2, overflow: 'hidden' }}>
          {items.map((it, i) => (
            <Pressable key={it.id} accessibilityRole="button" onPress={() => { void choose(it); }} style={{ paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: t.line2 }}>
              <Text style={{ color: t.fg, fontSize: 15.5 }}>{it.text}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
