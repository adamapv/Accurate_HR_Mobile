// More: who is signed in, this build, and Sign out. The rest of the Field view's More (leave, expenses, documents, device settings) joins it as it is built.
import { Linking } from 'react-native';
import { useSession } from '@/lib/session';
import { API_URL, APP_ENV, APP_VERSION } from '@/lib/config';
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
      <Card>
        <Body tone="muted">Leave, expenses, documents, Safety, your week and Chat are in the Field view in your browser for now.</Body>
        <Button kind="plain" onPress={() => { void Linking.openURL(API_URL); }}>Open AccurateHR in the browser</Button>
      </Card>
      {waiting > 0 && <Body tone="danger">{waiting === 1 ? 'One thing saved on your phone has not been sent yet. Signing out now tries once more, then it is lost.' : `${waiting} things saved on your phone have not been sent yet. Signing out now tries once more, then they are lost.`}</Body>}
      <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
      <Body tone="muted">Version {APP_VERSION}{APP_ENV !== 'production' ? ` · ${APP_ENV}` : ''}</Body>
    </Screen>
  );
}
