// Plant check-out: the trucks, machines and trailers with the person now, the ones free to take and the ones someone else has. What is in each list, the line
// under a name, what stops an item being taken and what can be done with it are the web app's own rules (shared/field-core.js). Taking, handing back and the
// pre-start open in the plant form; the check of what a ute carries opens in its own screen. It needs signal.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { PLANT_SEARCH, PLANT_SUB, PLANT_UNAVAILABLE, plantActions, plantBlocked, plantGroups, plantHeads, plantMeta, plantNote } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime } from '@/lib/dates';
import { Body, Button, Card, Empty, Field, Heading, Loading, Pill, Problem, Screen, Title } from '@/ui';

export type PlantItem = { id: string; name: string; brand: string | null; model: string | null; registration_number: string | null; current_hours: number | null; requires_licence: string | null; holder_name: string | null;
  category_name: string | null; held_since: string | null; prestart_required: boolean; ute_checklist_id: string | null; ute_last_checked: string | null; mine: boolean; block_reason: string | null; warning: string | null;
  prestart_due: boolean; ute_check_due: boolean };
type Groups = { mine: PlantItem[]; free: PlantItem[]; others: PlantItem[]; searching: boolean };
type Action = { mode: string; label: string; primary: boolean };

// When it was taken: a time today, the day otherwise.
function since(stored: string) {
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(stored) ? `${stored.replace(' ', 'T')}Z` : stored);
  if (Number.isNaN(d.getTime())) return fmtDateTime(stored);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Item({ r }: { r: PlantItem }) {
  const note = plantNote(r) as { tone: 'danger' | 'warn'; text: string } | null;
  const meta = plantMeta(r, since) as string;
  const open = (mode: string) => router.push(mode === 'ute' ? `/ute-check?id=${encodeURIComponent(r.id)}` : `/plant-item?id=${encodeURIComponent(r.id)}&mode=${mode}`);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Body strong>{r.name}</Body></View>
        {(plantBlocked(r) as boolean) && <Pill tone="danger">{PLANT_UNAVAILABLE as string}</Pill>}
      </View>
      {!!meta && <Body tone="muted">{meta}</Body>}
      {note && (note.tone === 'danger' ? <Body tone="danger">{note.text}</Body> : <Pill tone="warn">{note.text}</Pill>)}
      {(plantActions(r) as Action[]).map(a => <Button key={a.mode} kind={a.primary ? 'primary' : 'plain'} onPress={() => open(a.mode)}>{a.label}</Button>)}
    </Card>
  );
}

export default function Plant() {
  const { state } = useSession();
  const plant = useRead<{ rows: PlantItem[] }>('/plant/available');
  const [q, setQ] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!plant.data) return plant.error ? <Screen><Title>Plant check-out</Title><Problem>{plant.error}</Problem></Screen> : <Loading />;
  const g = plantGroups(plant.data.rows, q) as Groups;
  const heads = plantHeads(g) as { mine: string; noMine: string; free: string; noFree: string; others: string };
  return (
    <Screen>
      <Title>Plant check-out</Title>
      <Body tone="muted">{PLANT_SUB as string}</Body>
      <Problem>{plant.error}</Problem>

      <Heading>{heads.mine}</Heading>
      {g.mine.length === 0 ? <Empty icon="car-outline">{heads.noMine}</Empty> : g.mine.map(r => <Item key={r.id} r={r} />)}

      <Field label="Search" placeholder={PLANT_SEARCH as string} value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      <Heading>{heads.free}</Heading>
      {g.free.length === 0 ? <Empty icon="search-outline">{heads.noFree}</Empty> : g.free.map(r => <Item key={r.id} r={r} />)}

      {g.others.length > 0 && <Heading>{heads.others}</Heading>}
      {g.others.map(r => <Item key={r.id} r={r} />)}
    </Screen>
  );
}
