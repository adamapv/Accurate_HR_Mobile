import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { LockProvider } from '@/lock';
import { useTheme } from '@/theme';
import { noteCrash } from '@/lib/crash';
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

export default function RootLayout() {
  const t = useTheme();
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
