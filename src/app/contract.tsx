// A contract or an offer of employment (?id=<contract>): read it, then sign it by ticking the box and typing a full name, or decline an offer. Where it stands,
// the two signatures, what signing needs and sends, and every word are the web app's own rules (shared/field-core.js). Its text is the company's rich text,
// drawn as native text. Declining an offer archives the person, so the app signs out once it is done. It needs signal; printing is in the browser.
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CONTRACT_DECLINE, CONTRACT_GONE, contractDeclineDraft, contractFor, contractNote, contractParties, contractReference, contractSignDraft, contractSignProblem, contractSignWords, isOffer } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { RichText } from '@/rich';
import { Tick } from '@/whs';
import { Body, Button, Card, Field, Heading, Loading, Notice, Problem, Screen, Title, type Tone } from '@/ui';

type Contract = { id: string; kind: string; title: string; body: string; status: string; employee_name: string; employer_name: string | null; employer_signed_at: string | null; signature_name: string | null; signed_at: string | null;
  can_sign: boolean; can_decline: boolean; body_sha256?: string | null; signature_ip?: string | null };
type Party = { label: string; name: string; when: string; waiting: string };
const NO = CONTRACT_DECLINE as { open: string; about: string; reason: string; confirm: string; doneTitle: string; done: string };
const fmt = { fmtDate: (d: string) => fmtDate(String(d).slice(0, 10)), fmtDateTime };

export default function ContractScreen() {
  const { state, api, changed, signOut } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useRead<{ contract: Contract; company: string | null }>(id ? `/contracts/${encodeURIComponent(id)}` : null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [declined, setDeclined] = useState(false);
  if (declined) return <Screen centered><Title>{NO.doneTitle}</Title><Body>{NO.done}</Body><Button onPress={() => { void signOut(); }}>Close</Button></Screen>;
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!read.data) return read.error ? <Screen centered><Problem>{CONTRACT_GONE as string}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  const c = read.data.contract, offer = isOffer(c) as boolean;
  const note = contractNote(c, fmt) as { tone: Tone; text: string }, words = contractSignWords(offer) as { head: string; agree: string; name: string; hint: string; submit: string; said: string };
  const sign = async () => {
    const bad = contractSignProblem({ name, agree }) as string;
    if (bad) return setProblem(bad);
    setBusy('sign'); setProblem('');
    try { await api(`/contracts/${encodeURIComponent(c.id)}/sign`, { method: 'POST', body: contractSignDraft(name) }); await read.reload(); changed(); setSaid(words.said); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const decline = () => Alert.alert(NO.confirm, NO.about, [{ text: 'Cancel', style: 'cancel' }, { text: NO.open, style: 'destructive', onPress: () => {
    setBusy('decline'); setProblem('');
    api(`/contracts/${encodeURIComponent(c.id)}/decline`, { method: 'POST', body: contractDeclineDraft(reason) }).then(() => setDeclined(true))
      .catch(e => { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(''); });
  } }]);
  return (
    <Screen>
      <Title>{c.title}</Title>
      <Body tone="muted">{contractFor(c) as string}</Body>
      <Notice tone={note.tone}>{note.text.replace(' Print this page to keep a copy.', '')}</Notice>
      <Card>
        {!!read.data.company && <Body tone="muted">{read.data.company}</Body>}
        <RichText value={c.body} />
      </Card>
      {(contractParties(c, fmtDateTime) as Party[]).map(p => (
        <Card key={p.label}>
          <Body tone="muted">{p.label}</Body>
          {p.name ? <><Body strong>{p.name}</Body><Body tone="muted">{p.when}</Body></> : <Body tone="muted">{p.waiting}</Body>}
        </Card>
      ))}
      {c.status === 'signed' && <Body tone="muted">{contractReference(c) as string}</Body>}
      {!!said && <Notice tone="ok">{said}</Notice>}

      {c.can_sign && (
        <>
          <Heading>{words.head}</Heading>
          <Tick label={words.agree} value={agree} onChange={setAgree} />
          <Field label={words.name} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" maxLength={120} />
          <Body tone="muted">{words.hint}</Body>
          <Problem>{problem}</Problem>
          <Button onPress={() => { void sign(); }} busy={busy === 'sign'} disabled={!!busy}>{words.submit}</Button>
          {offer && c.can_decline && <Button kind="plain" onPress={() => setDeclining(d => !d)} disabled={!!busy}>{NO.open}</Button>}
          {offer && c.can_decline && declining && (
            <View style={{ gap: 10 }}>
              <Body tone="muted">{NO.about}</Body>
              <Field label={NO.reason} value={reason} onChangeText={setReason} multiline maxLength={500} />
              <Button kind="danger" onPress={decline} busy={busy === 'decline'} disabled={!!busy}>{NO.confirm}</Button>
            </View>
          )}
        </>
      )}
      {!c.can_sign && <Problem>{problem}</Problem>}
    </Screen>
  );
}
