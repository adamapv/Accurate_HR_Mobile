// Ticking one checklist on a job: each item OK, Not OK (and what is wrong) or not applicable (not for a required item), with a photo where one is asked for. What is
// still wrong with the answers is said under the items, and nothing is sent until every item is answered. How it is answered and what is sent are the web app's own
// rules (shared/job-checks.js). The tick goes through the outbox, so it works with no signal; a photo is taken and sent while there is signal.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { answerProblems, jobRunDraft, jobRunSaid, MAX_PHOTOS, STATE_LABELS, STATES } from '@shared/job-checks.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { isOnline } from '@/lib/offline';
import { uploadPhoto } from '@/lib/upload';
import type { Draft } from '@/lib/offline-core';
import { localToday } from '@/lib/dates';
import type { CheckItem, ForJobs } from '@/safety';
import { Choice, Body, Button, Card, Field, Loading, Notice, Problem, Screen, Title } from '@/ui';

type Answer = { state?: string; note?: string; photos?: string[] };

export default function ChecklistScreen() {
  const { state, api, offline, changed, sessionId } = useSession();
  const p = useLocalSearchParams<{ company: string; job: string; label: string; id: string; keys: string }>();
  const forJobs = useRead<ForJobs>(p.keys ? `/job-safety/for-jobs?jobs=${p.keys}` : null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState<{ text: string; tone: string } | null>(null);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!forJobs.data) return forJobs.error ? <Screen centered><Problem>{forJobs.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  const list = forJobs.data.checks?.[`${p.company}:${p.job}`]?.find(l => l.id === p.id) || null;
  if (!list) return <Redirect href="/" />;   // it came off the job

  const job = { company_id: p.company, job_id: p.job, label: p.label };
  const set = (id: string, patch: Answer) => setAnswers(a => ({ ...a, [id]: { ...(a[id] || {}), ...patch } }));
  const problems = answerProblems(list.items, answers) as { item_id: string; text: string }[];
  const online = isOnline();

  const addPhoto = async (it: CheckItem) => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera for AccurateHR in your phone’s settings to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (shot.canceled || !shot.assets?.[0]) return;
    setUploading(it.id);
    try {
      const key = await uploadPhoto(api, sessionId(), shot.assets[0].uri, shot.assets[0].mimeType || 'image/jpeg');
      setAnswers(a => ({ ...a, [it.id]: { ...(a[it.id] || {}), photos: [...(a[it.id]?.photos || []), key].slice(0, MAX_PHOTOS) } }));
    } catch (e) { setProblem(e instanceof Error ? e.message : 'The photo could not be sent.'); }
    setUploading(null);
  };
  const submit = async () => {
    setBusy(true); setProblem('');
    try {
      const { draft, held } = jobRunDraft({ job, list, answers, runDate: localToday() }) as { draft: Draft; held: string[] };
      const r = await offline.submit(draft);
      await forJobs.reload();
      changed();
      if (r.outcome === 'sent') {
        const told = jobRunSaid(list, !!r.result?.blocked) as { text: string; tone: string };
        if (told.tone !== 'ok') { setSaid(told); setBusy(false); return; }   // something required is Not OK: say so before leaving
      } else if (held.length) { setSaid(jobRunSaid(list, true) as { text: string; tone: string }); setBusy(false); return; }
      router.back();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };

  if (said) {
    return (
      <Screen centered>
        <Title>{list.name}</Title>
        <Body tone="danger">{said.text}</Body>
        <Button onPress={() => router.back()}>Done</Button>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{list.name}</Title>
      <Body tone="muted">{p.label} · {list.phase === 'finish' ? 'when you finish' : 'before you start'}</Body>
      {!!list.description && <Body>{list.description}</Body>}
      {list.items.map(it => {
        const a = answers[it.id] || {}, photos = a.photos || [];
        const showPhoto = (!!it.needs_photo && a.state === 'ok') || (a.state === 'fail' && (photos.length > 0 || !!it.needs_photo));
        return (
          <Card key={it.id}>
            <Body strong>{it.label}{!it.required ? ' (optional)' : ''}</Body>
            <Choice options={(STATES as string[]).filter(st => st !== 'na' || !it.required).map(st => ({ key: st, label: (STATE_LABELS as Record<string, string>)[st], tone: st === 'ok' ? 'ok' as const : st === 'fail' ? 'danger' as const : 'neutral' as const }))}
              value={a.state || ''} onChange={st => set(it.id, { state: st })} />
            {a.state === 'fail' && <Field label={`What is wrong with ${it.label}?`} value={a.note || ''} onChangeText={v => set(it.id, { note: v })} maxLength={500} multiline />}
            {showPhoto && (
              <>
                <Button kind="plain" icon="camera-outline" onPress={() => { void addPhoto(it); }} busy={uploading === it.id} disabled={!online || photos.length >= MAX_PHOTOS}>{photos.length ? 'Add another photo' : 'Take photo'}</Button>
                {photos.length > 0 && <Body tone="muted">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} added</Body>}
                {!online && <Body tone="muted">A photo needs signal.</Body>}
              </>
            )}
          </Card>
        );
      })}
      {problems.length > 0 && <Notice tone="info">{`${problems.length === 1 ? '1 thing' : `${problems.length} things`} to do first: ${problems[0].text}`}</Notice>}
      <Problem>{problem}</Problem>
      <Button icon="checkmark-circle-outline" onPress={submit} busy={busy} disabled={problems.length > 0 || !!uploading}>Submit checklist</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
