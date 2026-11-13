// Changing a PIN. A PIN that was set for the person (a new starter, or after a reset) has to be changed to their own before anything else opens; anyone can also
// change theirs from More (?own=1). What a new PIN must be and what is said are the web app's own rules (shared/field-core.js); the Worker also turns away easy ones.
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { PIN_CHANGED, PIN_HINT, pinLabel, pinProblem, pinStrict } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { Body, Button, Field, Problem, Screen, Title } from '@/ui';

export default function ChangePin() {
  const { state, changePin, signOut } = useSession();
  const { own } = useLocalSearchParams<{ own?: string }>();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState(false);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const forced = !!state.me.employee.must_change_pin, chosen = own === '1';
  if (done) return <Screen centered><Title>{PIN_CHANGED as string}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;
  if (!forced && !chosen) return <Redirect href="/" />;
  const strict = pinStrict(state.me.employee.role) as boolean;

  const submit = async () => {
    const bad = pinProblem({ next, confirm: again }, strict) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await changePin(current, next); if (!forced) setDone(true); } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  return (
    <Screen centered>
      <Title>{forced ? 'Choose your own PIN' : 'Change your PIN'}</Title>
      {forced && <Body tone="muted">The PIN you signed in with was set for you. Choose one only you know before you carry on.</Body>}
      <Field label="Current PIN" value={current} onChangeText={setCurrent} keyboardType="number-pad" secureTextEntry maxLength={8} />
      <Field label={pinLabel(strict) as string} value={next} onChangeText={setNext} keyboardType="number-pad" secureTextEntry maxLength={8} textContentType="newPassword" />
      <Body tone="muted">{PIN_HINT as string}</Body>
      <Field label="Confirm new PIN" value={again} onChangeText={setAgain} keyboardType="number-pad" secureTextEntry maxLength={8} textContentType="newPassword" />
      <Problem>{problem}</Problem>
      <Button onPress={() => { void submit(); }} busy={busy}>Save PIN</Button>
      {forced ? <Button kind="plain" onPress={() => { void signOut(); }} disabled={busy}>Sign out</Button> : <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>}
    </Screen>
  );
}
