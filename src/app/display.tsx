// Display & reading: Sunlight mode (this phone's, so it can be flipped in the sun and back in the ute) and the person's Reading & focus switches that the app
// applies: One thing at a time, Softer colours and Calmer screen. Reading & focus is saved with the person, so it is the same on every device they sign in on;
// what is kept and sent is the web app's own rule (shared/reading.js).
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { READING_APP_NOTE, READING_APP_SWITCHES, READING_SAID, SUNLIGHT_WORDS, isStandardReading, readingDraft } from '@shared/reading.js';
import { useSession } from '@/lib/session';
import { useDisplay } from '@/theme';
import { Body, Button, Card, Notice, Problem, Screen, Title, Toggle } from '@/ui';

type Switch = { key: string; label: string; hint: string };

export default function Display() {
  const { state, api, refreshMe } = useSession();
  const { mode, setMode, reading } = useDisplay();
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const saved = (state.me.employee as unknown as { reading_prefs?: unknown }).reading_prefs ?? null;

  const save = async (patch: Record<string, unknown>, words: string) => {
    setBusy(true); setProblem(''); setSaid('');
    try { await api('/me/preferences', { method: 'PUT', body: readingDraft(saved, patch) }); await refreshMe(); setSaid(words); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  const back = async () => {
    setBusy(true); setProblem(''); setSaid('');
    try { await api('/me/preferences', { method: 'PUT', body: { reading: null } }); await refreshMe(); setSaid(READING_SAID.standard as string); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Title>Display & reading</Title>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Body strong>{SUNLIGHT_WORDS.label as string}</Body>
            <Body tone="muted">{SUNLIGHT_WORDS.hint as string}</Body>
          </View>
          <Toggle accessibilityLabel={SUNLIGHT_WORDS.label as string} value={mode === 'light'} onValueChange={v => setMode(v ? 'light' : 'dark')} />
        </View>
      </Card>
      <Card>
        <Body strong>Reading & focus</Body>
        <Body tone="muted">How the app reads for you. Saved with you, so it is the same on every device you sign in on.</Body>
        {(READING_APP_SWITCHES as Switch[]).map(sw => (
          <View key={sw.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Body>{sw.label}</Body>
              <Body tone="muted">{sw.hint}</Body>
            </View>
            <Toggle accessibilityLabel={sw.label} value={!!(reading as unknown as Record<string, unknown>)[sw.key]} disabled={busy} onValueChange={v => { void save({ [sw.key]: v }, READING_SAID.saved as string); }} />
          </View>
        ))}
        <Body tone="muted">{READING_APP_NOTE as string}</Body>
        {!isStandardReading(saved) && <Button kind="plain" onPress={() => { void back(); }} disabled={busy}>Back to standard</Button>}
      </Card>
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem}</Problem>
    </Screen>
  );
}
