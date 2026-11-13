// My forms: the two figures over them, the ones still to fill in, then the ones already sent (which can be updated any time). What the figures and each row say
// are the web app's own rules (shared/field-core.js).
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { formRow, FORMS_SUB, formsDone, formsToDo, formTiles, NO_FORMS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

type Form = { id: string; title: string; description: string | null; submitted: number };
type Tile = { key: string; label: string; value: number; sub: string; tone?: 'warn' | 'ok' };

export default function Forms() {
  const { state } = useSession();
  const forms = useRead<{ rows: Form[] }>('/forms');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const rows = forms.data?.rows;
  const todo = formsToDo(rows || []) as Form[], done = formsDone(rows || []) as Form[];
  const row = (f: Form) => {
    const at = formRow(f) as { status: string; action: string; done: boolean };
    return (
      <Card key={f.id}>
        <Body>{f.title}</Body>
        {!!f.description && <Body tone="muted">{f.description}</Body>}
        <Body tone={at.done ? 'ok' : 'muted'}>{at.status}</Body>
        <Button kind={at.done ? 'plain' : 'primary'} onPress={() => router.push(`/form?id=${encodeURIComponent(f.id)}`)}>{at.action}</Button>
      </Card>
    );
  };
  return (
    <Screen>
      <Title>My forms</Title>
      <Body tone="muted">{FORMS_SUB as string}</Body>
      {forms.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(forms.offlineAt)}.</Body>}
      <Problem>{forms.error}</Problem>
      {!!rows && rows.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(formTiles(rows) as Tile[]).map(t => (
            <View key={t.key} style={{ flex: 1 }}>
              <Card>
                <Body tone="muted">{t.label}</Body>
                <Body tone={t.tone === 'warn' ? 'danger' : t.tone === 'ok' ? 'ok' : 'fg'}>{String(t.value)}</Body>
                <Body tone="muted">{t.sub}</Body>
              </Card>
            </View>
          ))}
        </View>
      )}
      {!rows ? (forms.error ? null : <Body tone="muted">Loading…</Body>) : rows.length === 0 ? <Body tone="muted">{NO_FORMS as string}</Body> : (
        <>
          {todo.length > 0 && <Body>To fill in</Body>}
          {todo.map(row)}
          {done.length > 0 && <Body>Submitted</Body>}
          {done.map(row)}
        </>
      )}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
