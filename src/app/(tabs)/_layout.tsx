// The tab bar: Home, Job card, Safety, My week and More, as in the web Field view. Nothing here opens for someone who is not signed in.
import type { ColorValue } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { feel } from '@/lib/haptics';
import { ClockNotice } from '@/clock-notice';
import { PushTaps } from '@/push-taps';
import { SAFE_MODE } from '@/lib/crash';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '@/lib/session';
import { useOutbox } from '@/lib/use-outbox';
import { Body, Button, Loading, Screen, Title } from '@/ui';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { state, retry, signOut } = useSession();
  const t = useTheme();
  const failed = useOutbox().filter(e => e.status === 'failed').length;
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signedOut') return <Redirect href="/sign-in" />;
  if (state.status === 'unreachable') {
    return (
      <Screen centered>
        <Title>Can’t reach AccurateHR</Title>
        <Body tone="muted">{state.message}</Body>
        <Button onPress={retry}>Try again</Button>
        <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
      </Screen>
    );
  }
  if (state.me.employee.must_change_pin) return <Redirect href="/change-pin" />;
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={typeof color === "string" ? color : undefined} size={size} />;
  return (
    <>
    {!SAFE_MODE && <ClockNotice />}
    {!SAFE_MODE && <PushTaps />}
    <Tabs screenListeners={{ tabPress: () => feel.pick() }} screenOptions={{ headerShown: false, tabBarActiveTintColor: t.accent2, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.topbar, borderTopColor: t.line }, tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' }, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home'), tabBarBadge: failed || undefined }} />
      <Tabs.Screen name="day" options={{ title: 'Job card', tabBarIcon: icon('time') }} />
      <Tabs.Screen name="safety" options={{ title: 'Safety', tabBarIcon: icon('shield-checkmark') }} />
      <Tabs.Screen name="week" options={{ title: 'My week', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle') }} />
    </Tabs>
    </>
  );
}
