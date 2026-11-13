// More: who is signed in, this build, and Sign out. Chat, POs, My leave, My expenses, Plant check-out, My qualifications, My documents, My assets and My forms open from here. The rest of the Field view's More (device settings, onboarding, performance) joins it as it is built.
// The sentence that says what is still in the browser is kept in step with what the app has: change it whenever a screen is added.
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { dayNoteRow, emailIsOn, emailSwitch, notifUnread } from '@shared/field-core.js';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { API_URL, APP_BUILD, APP_ENV } from '@/lib/config';
import { useOutbox } from '@/lib/use-outbox';
import { useRead } from '@/lib/use-read';
import { Avatar, Body, Button, Card, Heading, List, Notice, Pill, Problem, Row, Screen, Title } from '@/ui';

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
  const unreadNotes = notifUnread(notes.data) as number;
  return (
    <Screen>
      <Title>More</Title>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={me.employee.name} />
          <View style={{ flex: 1 }}>
            <Body strong>{me.employee.name}</Body>
            <Body tone="muted">{[me.access_level, me.employee.position].filter(Boolean).join(' · ') || me.employee.email}</Body>
            <Body tone="muted">{me.company.company_name}</Body>
          </View>
        </View>
      </Card>

      <Heading>My work</Heading>
      <List>
        <Row icon="notifications-outline" tint="blue" title="Notifications" sub={unreadNotes ? `${unreadNotes} unread` : 'Leave decisions, approvals and tasks'} right={unreadNotes ? <Pill tone="info">{String(unreadNotes)}</Pill> : undefined} onPress={() => router.push('/notifications')} />
        {can(me.access, 'chat') && <Row icon="chatbubbles-outline" tint="violet" title="Chat" sub="Message the office and your crew" onPress={() => router.push('/chats')} />}
        {can(me.access, 'purchase_orders') && <Row icon="receipt-outline" tint="violet" title="Purchase orders" sub="Raise one, and see yours" onPress={() => router.push('/pos')} />}
        {can(me.access, 'leave') && <Row icon="calendar-outline" tint="amber" title="My leave" sub="Your balances and requests" onPress={() => router.push('/leave')} />}
        <Row icon="cash-outline" tint="green" title="My expenses" sub="Claim fuel, materials and travel" onPress={() => router.push('/expenses')} />
        <Row icon="car-outline" tint="orange" title="Plant check-out" sub="Take a truck, machine or trailer, or hand one back" onPress={() => router.push('/plant')} last />
      </List>

      <Heading>My records</Heading>
      <List>
        <Row icon="shield-checkmark-outline" tint="teal" title="My qualifications" sub="Your licences and tickets" onPress={() => router.push('/quals')} />
        {can(me.access, 'documents') && <Row icon="document-text-outline" tint="violet" title="My documents" sub="Sign and open your paperwork" onPress={() => router.push('/documents')} />}
        <Row icon="construct-outline" tint="orange" title="My assets" sub="The tools issued to you" onPress={() => router.push('/assets')} />
        <Row icon="clipboard-outline" tint="pink" title="My forms" sub="Banking, super and other details" onPress={() => router.push('/forms')} last />
      </List>

      <Heading>This phone and you</Heading>
      <List>
        {!!me.email_configured && !!me.employee.email && <Row icon="mail-outline" tint="violet" title={emailSw.label} sub={emailOn ? `On, to ${me.employee.email}` : 'Off'} onPress={() => { void toggleEmail(); }} />}
        <Row icon="sunny-outline" tint="teal" title={noteRow.label} sub={noteRow.sub} onPress={() => router.push('/morning-note')} />
        <Row icon="key-outline" tint="amber" title="Change PIN" onPress={() => router.push('/change-pin?own=1')} />
        <Row icon="globe-outline" tint="blue" title="Open in the browser" sub="Contracts and Scan a card, for now" onPress={() => { void Linking.openURL(API_URL); }} last />
      </List>
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem}</Problem>

      {waiting > 0 && <Notice tone="warn">{waiting === 1 ? 'One thing saved on your phone has not been sent yet. Signing out now tries once more, then it is lost.' : `${waiting} things saved on your phone have not been sent yet. Signing out now tries once more, then they are lost.`}</Notice>}
      <Button kind="danger" icon="log-out-outline" onPress={() => { void signOut(); }}>Sign out</Button>
      <View style={{ alignItems: 'center' }}><Body tone="muted">Version {APP_BUILD}{APP_ENV !== 'production' ? ` · ${APP_ENV}` : ''}</Body></View>
    </Screen>
  );
}
