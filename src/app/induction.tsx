// An induction module from the person's onboarding (?id=<module>): read it, then say it is completed. What it is called, how long it takes and what the
// button says are the web app's own words (shared/field-core.js). Its content is the company's rich text, drawn as native text. Completing it needs signal.
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { moduleSub, NO_CONTENT, ONB_DONE_PILL, ONB_MODULE_DONE, onbModuleDraft } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { RichText } from '@/rich';
import type { Onboarding } from '@/app/onboarding';
import { Body, Button, Card, Loading, Pill, Problem, Screen, Title } from '@/ui';

export default function Induction() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mine = useRead<Onboarding>('/onboarding/mine?full=1');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!mine.data) return mine.error ? <Screen centered><Problem>{mine.error}</Problem></Screen> : <Loading />;
  const module = (mine.data.items || []).find(i => i.kind === 'module' && i.id === id);
  if (!module) return <Redirect href="/onboarding" />;
  const sub = moduleSub(module) as string;
  const complete = async () => {
    setBusy(true); setProblem('');
    try { await api('/onboarding-run-modules', { method: 'PUT', body: onbModuleDraft(module) }); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <Screen>
      <Title>{module.title}</Title>
      {!!sub && <Body tone="muted">{sub}</Body>}
      {module.done && <Pill tone="ok">{ONB_DONE_PILL as string}</Pill>}
      <Card>{module.content ? <RichText value={module.content} /> : <Body tone="muted">{NO_CONTENT as string}</Body>}</Card>
      <Problem>{problem}</Problem>
      {!module.done && <Button onPress={() => { void complete(); }} busy={busy}>{ONB_MODULE_DONE as string}</Button>}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Close</Button>
    </Screen>
  );
}
