// More: who is signed in, this build, and Sign out. Chat, POs, My leave, My expenses, My qualifications, My documents, My assets and My forms open from here. The rest of the Field view's More (device settings, onboarding, performance) joins it as it is built.
// The sentence that says what is still in the browser is kept in step with what the app has: change it whenever a screen is added.
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { dayNoteRow, emailIsOn, emailSwitch, notifBellLabel, notifUnread } from '@shared/field-core.js';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { API_URL, APP_BUILD, APP_ENV } from '@/lib/config';
import { useOutbox } from '@/lib/use-outbox';
import { useRead } from '@/lib/use-read';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

export default function More() {
  const { state, signOut, api, refreshMe } = useSession();
  const notes = useRead<{ rows: { read_at: string | null }[]; unread: number }>('/notifications');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const waiting = useOutbox().filter(e => e.status === 'pending').length;
  if (state.status !== 'signedIn') return null;
  const me = state.me;
  const emailOn = emailIsOn(me.employee) as boolean, emailSw = emailSwitch(emailOn, me.employee.email) as { label: string; said: string; draft: object };
  const noteRow = dayNoteRow(me.employee) as { label: string; sub: string };
  const toggleEmail = async () => {
    setProblem(''); setSaid('');
    try { await api('/me/preferences', { method: 'PUT', body: emailSw.draft }); await refreshMe(); setSaid(emailSw.said); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
  };
  return (
    <Screen>
      <Title>More</Title>
      <Card>
        <Body>{me.employee.name}</Body>
        <Body tone="muted">{me.employee.email}</Body>
        <Body tone="muted">{me.company.company_name}{me.access_level ? ` · ${me.access_level}` : ''}</Body>
      </Card>
      <Button kind="plain" onPress={() => router.push('/notifications')}>{notifBellLabel(notifUnread(notes.data)) as string}</Button>
      {can(me.access, 'chat') && <Button kind="plain" onPress={() => router.push('/chats')}>Chat</Button>}
      {can(me.access, 'purchase_orders') && <Button kind="plain" onPress={() => router.push('/pos')}>POs</Button>}
      {can(me.access, 'leave') && <Button kind="plain" onPress={() => router.push('/leave')}>My leave</Button>}
      <Button kind="plain" onPress={() => router.push('/expenses')}>My expenses</Button>
      <Button kind="plain" onPress={() => router.push('/quals')}>My qualifications</Button>
      {can(me.access, 'documents') && <Button kind="plain" onPress={() => router.push('/documents')}>My documents</Button>}
      <Button kind="plain" onPress={() => router.push('/assets')}>My assets</Button>
      <Button kind="plain" onPress={() => router.push('/forms')}>My forms</Button>
      <Body tone="muted">This phone and you</Body>
      {!!me.email_configured && !!me.employee.email && <Button kind="plain" onPress={() => { void toggleEmail(); }}>{emailSw.label}</Button>}
      <Button kind="plain" onPress={() => router.push('/morning-note')}>{noteRow.label}</Button>
      <Button kind="plain" onPress={() => router.push('/change-pin?own=1')}>Change PIN</Button>
      {!!said && <Body tone="ok">{said}</Body>}
      <Problem>{problem}</Problem>
      <Card>
        <Body tone="muted">Contracts and scanning a card are in the Field view in your browser for now. In Chat, photos, voice messages and documents are sent from the browser for now.</Body>
        <Button kind="plain" onPress={() => { void Linking.openURL(API_URL); }}>Open AccurateHR in the browser</Button>
      </Card>
      {waiting > 0 && <Body tone="danger">{waiting === 1 ? 'One thing saved on your phone has not been sent yet. Signing out now tries once more, then it is lost.' : `${waiting} things saved on your phone have not been sent yet. Signing out now tries once more, then they are lost.`}</Body>}
      <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
      <Body tone="muted">Version {APP_BUILD}{APP_ENV !== 'production' ? ` · ${APP_ENV}` : ''}</Body>
    </Screen>
  );
}
