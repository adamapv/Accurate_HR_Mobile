// The person's own menu, opened by their initials at the top of Home: who is signed in, My profile, Display & reading, Sunlight mode (a switch, right there, so it can be
// flipped in the sun), Change PIN, Help and Sign out. A sheet that comes up from the bottom, as the date and time sheet does; what each row opens is a screen of its own.
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { feel } from '@/lib/haptics';
import { space, useDisplay, useTheme } from '@/theme';
import { Avatar, Toggle, Touch, type IconName } from '@/ui';

export function AccountMenu({ name, detail }: { name: string; detail: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { mode, setMode, calm } = useDisplay();
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const go = (path: string) => { setOpen(false); router.push(path as never); };
  const out = () => { setOpen(false); Alert.alert('Sign out?', 'Anything waiting to be sent stays on this phone and is sent when you sign in again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } }]); };
  const row = (icon: IconName, title: string, onPress: () => void, danger?: boolean) => (
    <Pressable key={title} accessibilityRole="button" onPress={() => { feel.tap(); onPress(); }} style={[styles.row, { borderTopColor: t.line2 }]}>
      <Ionicons name={icon} size={22} color={danger ? t.danger : t.accent2} />
      <Text style={[styles.rowText, { color: danger ? t.danger : t.fg }]}>{title}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={t.dim} />}
    </Pressable>
  );
  return (
    <>
      <Touch accessibilityRole="button" accessibilityLabel={`${name}: your menu`} onPress={() => { feel.tap(); setOpen(true); }}><Avatar name={name} size={52} /></Touch>
      <Modal visible={open} transparent animationType={calm ? 'none' : 'slide'} statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" style={styles.dim} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.grip, { backgroundColor: t.line }]} />
          <View style={styles.who}>
            <Avatar name={name} size={56} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.name, { color: t.fg }]}>{name}</Text>
              <Text numberOfLines={2} style={[styles.detail, { color: t.muted }]}>{detail}</Text>
            </View>
          </View>
          {row('person-outline', 'My profile', () => go('/my-hr'))}
          {row('contrast-outline', 'Display & reading', () => go('/display'))}
          <View style={[styles.row, { borderTopColor: t.line2 }]}>
            <Ionicons name="sunny-outline" size={22} color={t.accent2} />
            <Text style={[styles.rowText, { color: t.fg }]}>Sunlight mode</Text>
            <Toggle accessibilityLabel="Sunlight mode" value={mode === 'light'} onValueChange={v => setMode(v ? 'light' : 'dark')} />
          </View>
          {row('key-outline', 'Change PIN', () => go('/change-pin?own=1'))}
          {row('help-circle-outline', 'Help', () => go('/help'))}
          {row('log-out-outline', 'Sign out', out, true)}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: space.xl, paddingTop: 10 },
  grip: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 14 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14 },
  name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  detail: { fontSize: 14.5, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: 17, fontWeight: '600' },
});
