import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { LockProvider } from '@/lock';
import { useTheme } from '@/theme';
import { markStarting, noteCrash, startedCleanly } from '@/lib/crash';
import { AppState } from 'react-native';
import { APP_BUILD } from '@/lib/config';
import { Body, Button, Screen, Title } from '@/ui';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';

// A screen that broke while drawing shows this in its place, with a way to try again, and the error is written down for the More tab.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { noteCrash(error, false); }, [error]);
  return (
    <Screen centered>
      <Title>Something went wrong</Title>
      <Body tone="muted">This screen hit a problem. Try again, or go back and come in another way.</Body>
      <Body tone="muted">{String(error?.message || error).slice(0, 300)}</Body>
      <Body tone="muted">{`Version ${APP_BUILD}`}</Body>
      <Button onPress={() => { void retry(); }}>Try again</Button>
    </Screen>
  );
}

let marked = false;
export default function RootLayout() {
  if (!marked) { marked = true; markStarting(); }
  const t = useTheme();
  // Open for a few seconds with nothing gone wrong: this start counts as a good one (src/lib/crash.ts).
  useEffect(() => {
    const timer = setTimeout(startedCleanly, 4000);
    const sub = AppState.addEventListener('change', s => { if (s === 'background') startedCleanly(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <LockProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
        </LockProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
