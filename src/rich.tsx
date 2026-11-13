// Draws AccurateHR's rich text (a SWMS's controls, a policy) as native text. It is cleaned first by the shared sanitizeRich, exactly as the web app does before it
// shows any, and text written before the editor existed (plain lines) is shown as it always was: a bullet a line, or as typed.
import { Linking, StyleSheet, Text, View } from 'react-native';
import { isRichText, sanitizeRich } from '@shared/rich-text.js';
import { parseRich, type Block, type Inline } from '@/lib/rich-parse';
import { useTheme } from '@/theme';

function Runs({ runs, size = 16, bold }: { runs: Inline[]; size?: number; bold?: boolean }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.fg, fontSize: size, lineHeight: Math.round(size * 1.45), fontWeight: bold ? '700' : '400', flexShrink: 1 }}>
      {runs.map((r, i) => (
        <Text key={i} onPress={r.href ? () => { void Linking.openURL(r.href!).catch(() => {}); } : undefined} accessibilityRole={r.href ? 'link' : undefined}
          style={{ fontWeight: r.bold || bold ? '700' : undefined, fontStyle: r.italic ? 'italic' : undefined, textDecorationLine: r.underline || r.href ? 'underline' : undefined, color: r.href ? t.accent2 : undefined }}>{r.text}</Text>
      ))}
    </Text>
  );
}
function Blocks({ blocks }: { blocks: Block[] }) {
  const t = useTheme();
  return (
    <View style={styles.gap}>
      {blocks.map((b, i) => {
        if (b.kind === 'break') return <View key={i} style={[styles.rule, { borderColor: t.line }]} />;
        if (b.kind === 'list') return (
          <View key={i} style={styles.gap}>
            {b.items.map((it, j) => (
              <View key={j} style={styles.item}>
                <Text style={{ color: t.muted, fontSize: 16, lineHeight: 23, width: 22 }}>{b.ordered ? `${j + 1}.` : '•'}</Text>
                <View style={styles.itemBody}>{it.runs.some(r => r.text.trim()) && <Runs runs={it.runs} />}{it.blocks.length > 0 && <Blocks blocks={it.blocks} />}</View>
              </View>
            ))}
          </View>
        );
        if (b.kind === 'table') return (
          <View key={i} style={[styles.table, { borderColor: t.line }]}>
            {b.rows.map((row, j) => (
              <View key={j} style={[styles.tr, { borderColor: t.line }]}>
                {row.map((cell, k) => <View key={k} style={[styles.td, { borderColor: t.line, backgroundColor: cell.header ? t.surface2 : undefined }]}><Blocks blocks={cell.blocks} /></View>)}
              </View>
            ))}
          </View>
        );
        return <View key={i} style={{ marginLeft: b.indent * 16 }}><Runs runs={b.runs} size={b.kind === 'h2' ? 19 : b.kind === 'h3' ? 17 : 16} bold={b.kind !== 'p'} /></View>;
      })}
    </View>
  );
}

// `kind` says how text from before the editor is shown: 'bullets' (a line a bullet) or 'text' (as typed).
export function RichText({ value, kind = 'text' }: { value: unknown; kind?: 'bullets' | 'text' }) {
  const t = useTheme();
  if (isRichText(value)) return <Blocks blocks={parseRich(sanitizeRich(value))} />;
  const lines = (Array.isArray(value) ? value.map(String) : String(value ?? '').split('\n')).filter(l => l.trim());
  if (kind === 'bullets') return <Blocks blocks={[{ kind: 'list', ordered: false, items: lines.map(l => ({ runs: [{ text: l }], blocks: [] })) }]} />;
  return <Text style={{ color: t.fg, fontSize: 16, lineHeight: 23 }}>{String(value ?? '')}</Text>;
}

const styles = StyleSheet.create({
  gap: { gap: 6 },
  item: { flexDirection: 'row' },
  itemBody: { flex: 1, gap: 4 },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 6 },
  table: { borderWidth: 1, borderRadius: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  td: { flex: 1, padding: 6, borderRightWidth: StyleSheet.hairlineWidth },
});
