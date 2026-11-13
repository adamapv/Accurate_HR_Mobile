import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { LockProvider } from '@/lock';
import { useTheme } from '@/theme';

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
