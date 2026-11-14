// Shown at the top of Home and More while the app is in safe mode (src/lib/crash.ts): the last start did not finish, so this one left out the app lock,
// sending with the app closed, and notifications. It says so, lets the person copy what went wrong when the app managed to write it down, and turns the
// extras back on for the next start.
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { crashText, lastCrash, leaveSafeMode, SAFE_MODE } from '@/lib/crash';
import { APP_BUILD } from '@/lib/config';
import { Body, Button, Card } from '@/ui';

export function SafeModeCard() {
  const [said, setSaid] = useState('');
  if (!SAFE_MODE) return null;
  const crash = lastCrash();
  return (
    <Card>
      <Body strong>The app didn’t finish opening last time</Body>
      <Body tone="muted">So this time it opened without three extras: the app lock, sending what is waiting while the app is closed, and notifications. Everything else works as usual.</Body>
      <Body tone="muted">{crash ? `${crash.message}\nVersion ${crash.build}` : `Nothing was written down about why. Version ${APP_BUILD}`}</Body>
      <Button kind="plain" icon="copy-outline" onPress={() => { void Clipboard.setStringAsync(crash ? crashText(crash) : `AccurateHR ${APP_BUILD}\nOpened in safe mode; no error was recorded.`); setSaid('Copied. Paste it to whoever looks after the app.'); }}>Copy the details</Button>
      <Button kind="plain" onPress={() => { leaveSafeMode(); setSaid('The extras will be back the next time you open the app. If it closes again, it will come back like this.'); }}>Turn the extras back on</Button>
      {!!said && <Body tone="ok">{said}</Body>}
    </Card>
  );
}
