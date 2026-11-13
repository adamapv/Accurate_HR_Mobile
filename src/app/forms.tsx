// My forms: the two figures over them, the ones still to fill in, then the ones already sent (which can be updated any time). What the figures and each row say
// are the web app's own rules (shared/field-core.js).
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { formRow, FORMS_SUB, formsDone, formsToDo, formTiles, NO_FORMS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { Body, Button, Card, Empty, Figures, Heading, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

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
        <Body strong>{f.title}</Body>
        {!!f.description && <Body tone="muted">{f.description}</Body>}
        <Pill tone={at.done ? 'ok' : 'warn'}>{at.status}</Pill>
        <Button kind={at.done ? 'plain' : 'primary'} onPress={() => router.push(`/form?id=${encodeURIComponent(f.id)}`)}>{at.action}</Button>
      </Card>
    );
  };
  return (
    <Screen>
      <Title>My forms</Title>
      <Body tone="muted">{FORMS_SUB as string}</Body>
      {forms.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(forms.offlineAt)}.`}</Notice>}
      <Problem>{forms.error}</Problem>
      {!!rows && rows.length > 0 && (
        <Figures figures={formTiles(rows) as Figure[]} />
      )}
      {!rows ? (forms.error ? null : <Body tone="muted">Loading…</Body>) : rows.length === 0 ? <Empty>{NO_FORMS as string}</Empty> : (
        <>
          {todo.length > 0 && <Heading>To fill in</Heading>}
          {todo.map(row)}
          {done.length > 0 && <Heading>Submitted</Heading>}
          {done.map(row)}
        </>
      )}
    </Screen>
  );
}
