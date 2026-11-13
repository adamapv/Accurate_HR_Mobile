// Signing in: the company code first, then an email and PIN, as on the web. With a code the app is told nothing about the company (no name, no logo).
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { APP_ENV } from '@/lib/config';
import { Body, Button, Field, Problem, Screen, Title } from '@/ui';

export default function SignIn() {
  const { state, api, tenantCode, lastEmail, setTenantCode, signIn } = useSession();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState(lastEmail);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status === 'signedIn') return <Redirect href="/" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setProblem('');
    try { await fn(); } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  // The code is checked before it is kept: a code nobody has is told so here, not after the PIN.
  const useCode = () => run(async () => {
    const c = code.trim().toLowerCase();
    if (!c) throw new Error('Enter your company code.');
    await setTenantCode(c);
    try { await api('/bootstrap-check'); } catch (e) { await setTenantCode(null); throw new Error(e instanceof Error && /not found/i.test(e.message) ? 'No company has that code. Check it with your office.' : e instanceof Error ? e.message : 'Try again.'); }
  });
  const submit = () => run(async () => {
    if (!email.trim() || !pin) throw new Error('Enter your email and PIN.');
    await signIn(email.trim().toLowerCase(), pin);
  });

  return (
    <Screen centered>
      <Title>AccurateHR</Title>
      {APP_ENV !== 'production' && <Body tone="muted">Staging build: for testing only.</Body>}
      {!tenantCode ? (
        <>
          <Body tone="muted">Enter the company code your office gave you.</Body>
          <Field label="Company code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={useCode} />
          <Problem>{problem}</Problem>
          <Button onPress={useCode} busy={busy}>Continue</Button>
        </>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" />
          <Field label="PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
          <Problem>{problem}</Problem>
          <Button onPress={submit} busy={busy}>Sign in</Button>
          <Button kind="plain" onPress={() => { setProblem(''); setPin(''); setEmail(''); void setTenantCode(null); }} disabled={busy}>Not your company?</Button>
        </>
      )}
    </Screen>
  );
}
