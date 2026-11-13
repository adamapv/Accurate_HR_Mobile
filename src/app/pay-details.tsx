// Pay & super, or PPE & uniform (?card=pay or ppe): the person's own bank account, super fund and tax file number, or their sizes. Which boxes there are comes
// from the Worker; what the form opens with (never the account number or tax file number, which only arrive masked), what is sent, the bank named from the BSB
// and every word are the web app's own rules (shared/field-core.js). Nothing here is kept on the phone, so it needs signal.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { bankFill, bsbDigits, bsbHint, bsbLookupPath, DETAIL_CARDS, DETAIL_CHOOSE, DETAIL_KEEP_HINT, DETAIL_UNREADABLE, detailDraft, detailFormStart, detailGroupsOf, detailHasSensitive, detailPlaceholder } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useDetails, type DetailField, type DetailGroup } from '@/lib/use-details';
import { ChooseField } from '@/pickers';
import { Body, Button, Field, Heading, Loading, Notice, Problem, Screen, Title } from '@/ui';

type CardT = { key: string; title: string; ids: string[]; blank: string; note: string };
type Form = Record<string, string>;
type Found = { bsb: string; bank: string | null };

export default function PayDetails() {
  const { state, api, changed } = useSession();
  const { card } = useLocalSearchParams<{ card: string }>();
  const details = useDetails();
  const [form, setForm] = useState<Form | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const auto = useRef('');
  const which = (DETAIL_CARDS as CardT[]).find(c => c.key === card) || (DETAIL_CARDS as CardT[])[0];
  const groups = detailGroupsOf(details.data?.schema, which.ids) as DetailGroup[];
  const f: Form = form || (details.data ? detailFormStart(groups, details.data) as Form : {});
  const hasBsb = groups.some(g => g.fields.some(x => x.key === 'bank_bsb'));
  const bsb = hasBsb ? bsbDigits(f) as string : '';
  // The bank named from a whole BSB: the Bank box is filled in while it holds nothing or what the last lookup put there.
  useEffect(() => {
    if (!bsb) { setFound(null); return; }
    let gone = false;
    api<{ bank?: string | null }>(bsbLookupPath(bsb) as string).then(r => {
      if (gone) return;
      const bank = r?.bank || null, last = auto.current;
      auto.current = bank || '';
      setFound({ bsb, bank });
      setForm(x => x ? bankFill(x, last, bank) as Form : x);
    }).catch(() => { if (!gone) setFound({ bsb, bank: null }); });
    return () => { gone = true; };
  }, [bsb, api]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!details.data) return details.error ? <Screen><Title>{which.title}</Title><Problem>{details.error}</Problem></Screen> : <Loading />;
  const data = details.data;
  const set = (key: string, v: string) => setForm({ ...f, [key]: v });
  const save = async () => {
    setBusy(true); setProblem('');
    try { await api('/employee-details/mine', { method: 'PUT', body: detailDraft(groups, f) }); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  const box = (x: DetailField) => {
    const hint = bsbHint(x, found, f) as string;
    return (
      <View key={x.key} style={{ gap: 4 }}>
        {x.kind === 'choice'
          ? <ChooseField<string> label={x.label} placeholder={DETAIL_CHOOSE as string} value={(x.options || []).find(o => o.code === f[x.key])?.text || ''}
              options={[{ key: '', title: DETAIL_CHOOSE as string, item: '' }, ...(x.options || []).map(o => ({ key: o.code, title: o.text, item: o.code }))]} onChoose={v => set(x.key, v)} />
          : <Field label={x.label} value={f[x.key] || ''} onChangeText={v => set(x.key, v)} maxLength={x.max || (x.kind === 'textarea' ? 300 : 120)} multiline={x.kind === 'textarea'}
              keyboardType={x.kind === 'digits' || x.kind === 'bsb' ? 'number-pad' : 'default'} autoCorrect={false} autoComplete="off" placeholder={(detailPlaceholder(x, data.masked) as string) || undefined} />}
        {!!hint && <Body tone="muted">{hint}</Body>}
      </View>
    );
  };
  return (
    <Screen>
      <Title>{which.title}</Title>
      {(data.unreadable?.length || 0) > 0 && <Notice tone="warn">{DETAIL_UNREADABLE as string}</Notice>}
      {groups.map(g => (
        <View key={g.id} style={{ gap: 10 }}>
          {groups.length > 1 && <Heading>{g.label}</Heading>}
          {g.fields.map(box)}
        </View>
      ))}
      {(detailHasSensitive(groups) as boolean) && <Body tone="muted">{DETAIL_KEEP_HINT as string}</Body>}
      <Problem>{problem}</Problem>
      <Button onPress={() => { void save(); }} busy={busy}>Save</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
