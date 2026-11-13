// A PIN that was set for the person (a new starter, or after a reset) has to be changed to their own before anything else opens.
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { Body, Button, Field, Problem, Screen, Title } from '@/ui';

export default function ChangePin() {
  const { state, changePin, signOut } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!state.me.employee.must_change_pin) return <Redirect href="/" />;

  const submit = async () => {
    if (next !== again) return setProblem('The two new PINs are not the same.');
    setBusy(true); setProblem('');
    try { await changePin(current, next); } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  return (
    <Screen centered>
      <Title>Choose your own PIN</Title>
      <Body tone="muted">The PIN you signed in with was set for you. Choose one only you know before you carry on.</Body>
      <Field label="Current PIN" value={current} onChangeText={setCurrent} keyboardType="number-pad" secureTextEntry maxLength={8} />
      <Field label="New PIN" value={next} onChangeText={setNext} keyboardType="number-pad" secureTextEntry maxLength={8} textContentType="newPassword" />
      <Field label="New PIN again" value={again} onChangeText={setAgain} keyboardType="number-pad" secureTextEntry maxLength={8} textContentType="newPassword" />
      <Problem>{problem}</Problem>
      <Button onPress={submit} busy={busy}>Save PIN</Button>
      <Button kind="plain" onPress={() => { void signOut(); }} disabled={busy}>Sign out</Button>
    </Screen>
  );
}
