// The few building blocks every screen uses, in the app's own colours and touch sizes.
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, TOUCH, useTheme } from '@/theme';

export function Screen({ children, centered }: { children: ReactNode; centered?: boolean }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.screen, centered && styles.centered]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={[styles.title, { color: t.fg }]}>{children}</Text>;
}
export function Body({ children, tone = 'fg' }: { children: ReactNode; tone?: 'fg' | 'muted' | 'danger' | 'ok' }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: t[tone] }]}>{children}</Text>;
}
export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>{children}</View>;
}
export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.dim} {...input}
        style={[styles.input, { color: t.fg, backgroundColor: t.surface2, borderColor: t.line }]} />
    </View>
  );
}
export function Button({ children, onPress, kind = 'primary', busy, disabled }: { children: string; onPress: () => void; kind?: 'primary' | 'plain'; busy?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const off = !!busy || !!disabled;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'primary' ? { backgroundColor: t.accent } : { borderColor: t.line, borderWidth: 1 }, (pressed || off) && styles.dim]}>
      {busy ? <ActivityIndicator color={kind === 'primary' ? '#FFFFFF' : t.fg} /> : <Text style={[styles.buttonText, { color: kind === 'primary' ? '#FFFFFF' : t.fg }]}>{children}</Text>}
    </Pressable>
  );
}
export function Problem({ children }: { children: ReactNode }) {
  const t = useTheme();
  if (!children) return null;
  return <Text accessibilityRole="alert" style={[styles.body, { color: t.danger }]}>{children}</Text>;
}
export function Loading() {
  const t = useTheme();
  return <View style={[styles.fill, styles.centered, { backgroundColor: t.bg }]}><ActivityIndicator color={t.accent} size="large" /></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: space.xl, gap: space.lg, flexGrow: 1 },
  centered: { justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  field: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '600' },
  input: { minHeight: TOUCH + 4, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 17 },
  button: { minHeight: TOUCH + 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonText: { fontSize: 17, fontWeight: '600' },
  dim: { opacity: 0.6 },
});
