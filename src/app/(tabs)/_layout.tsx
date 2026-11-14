// The tab bar: Home, Job card, Safety, My week and More, as in the web Field view. Nothing here opens for someone who is not signed in.
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
  // The tab someone is on has its icon filled, on a soft pill of the app's colour; the others are outlines.
  const icon = (name: string) => ({ color, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? 'rgba(84,104,255,0.26)' : 'transparent' }}>
      <Ionicons name={(focused ? name : `${name}-outline`) as keyof typeof Ionicons.glyphMap} color={typeof color === 'string' ? color : undefined} size={22} />
    </View>
  );
  return (
    <>
    {!SAFE_MODE && <ClockNotice />}
    {!SAFE_MODE && <PushTaps />}
    <Tabs screenListeners={{ tabPress: () => feel.pick() }} screenOptions={{ headerShown: false, tabBarActiveTintColor: t.accent2, tabBarInactiveTintColor: t.muted, tabBarStyle: { position: 'absolute', marginHorizontal: 14, bottom: Math.max(insets.bottom, 10) + 4, height: 74, paddingTop: 8, paddingBottom: 12, borderRadius: 37, backgroundColor: '#161625', borderTopWidth: StyleSheet.hairlineWidth, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, borderTopColor: t.line, shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 18 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginTop: 2, lineHeight: 14 }, tabBarItemStyle: { paddingVertical: 0, height: 54 }, tabBarIconStyle: { height: 30, marginTop: 0 }, tabBarLabelPosition: 'below-icon', tabBarHideOnKeyboard: true, animation: 'fade', sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home'), tabBarBadge: failed || undefined }} />
      <Tabs.Screen name="day" options={{ title: 'Job card', tabBarIcon: icon('time') }} />
      <Tabs.Screen name="safety" options={{ title: 'Safety', tabBarIcon: icon('shield-checkmark') }} />
      <Tabs.Screen name="week" options={{ title: 'My week', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle') }} />
    </Tabs>
    </>
  );
}
