// More: who is signed in, this build, and Sign out. Chat, POs, My leave, My expenses, My qualifications, My documents, My assets and My forms open from here. The rest of the Field view's More (device settings, onboarding, performance) joins it as it is built.
// The sentence that says what is still in the browser is kept in step with what the app has: change it whenever a screen is added.
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { useSession } from '@/lib/session';
import { API_URL, APP_BUILD, APP_ENV } from '@/lib/config';
import { useOutbox } from '@/lib/use-outbox';
import { Body, Button, Card, Screen, Title } from '@/ui';

export default function More() {
  const { state, signOut } = useSession();
  const waiting = useOutbox().filter(e => e.status === 'pending').length;
  if (state.status !== 'signedIn') return null;
  const me = state.me;
  return (
    <Screen>
      <Title>More</Title>
      <Card>
        <Body>{me.employee.name}</Body>
        <Body tone="muted">{me.employee.email}</Body>
        <Body tone="muted">{me.company.company_name}{me.access_level ? ` · ${me.access_level}` : ''}</Body>
      </Card>
      {can(me.access, 'chat') && <Button kind="plain" onPress={() => router.push('/chats')}>Chat</Button>}
      {can(me.access, 'purchase_orders') && <Button kind="plain" onPress={() => router.push('/pos')}>POs</Button>}
      {can(me.access, 'leave') && <Button kind="plain" onPress={() => router.push('/leave')}>My leave</Button>}
      <Button kind="plain" onPress={() => router.push('/expenses')}>My expenses</Button>
      <Button kind="plain" onPress={() => router.push('/quals')}>My qualifications</Button>
      {can(me.access, 'documents') && <Button kind="plain" onPress={() => router.push('/documents')}>My documents</Button>}
      <Button kind="plain" onPress={() => router.push('/assets')}>My assets</Button>
      <Button kind="plain" onPress={() => router.push('/forms')}>My forms</Button>
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
