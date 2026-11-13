// A voice message in a chat: a play button, the bars and how long it is. The recording is played straight from the Worker with the session, never saved to
// the phone. Only one plays at a time. The bars, the times and the words are the web app's own (shared/chat-core.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CHAT_VOICE, chatSecs, chatWave } from '@shared/chat-core.js';
import { TOUCH, useTheme } from '@/theme';

const WORDS = CHAT_VOICE as Record<string, string>;
// The recording being played, so starting another pauses it.
let current: AudioPlayer | null = null;

// What the phone records: AAC in an MP4 file on both kinds of phone, which every browser and phone can play, in mono at a voice's bit rate.
export const VOICE_RECORDING = {
  extension: '.m4a', sampleRate: 22050, numberOfChannels: 1, bitRate: 32000,
  android: { outputFormat: 'mpeg4' as const, audioEncoder: 'aac' as const },
  ios: { outputFormat: 'aac ', audioQuality: 32, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: 'audio/mp4', bitsPerSecond: 32000 },
};
export const VOICE_TYPE = 'audio/mp4';

export function VoicePlayer({ uri, headers, secs, id, mine }: { uri: string; headers?: Record<string, string>; secs: number; id: string; mine: boolean }) {
  const t = useTheme();
  const player = useRef<AudioPlayer | null>(null);
  const [status, setStatus] = useState<{ playing: boolean; pos: number; loading: boolean }>({ playing: false, pos: 0, loading: false });
  const [failed, setFailed] = useState(false);
  const bars = useMemo(() => chatWave(id) as number[], [id]);
  useEffect(() => () => {
    const p = player.current;
    if (!p) return;
    if (current === p) current = null;
    try { p.pause(); p.release(); } catch { /* already gone */ }
  }, []);
  const toggle = () => {
    try {
      let p = player.current;
      if (!p) {
        p = createAudioPlayer({ uri, headers }, { updateInterval: 250 });
        p.addListener('playbackStatusUpdate', (s: AudioStatus) => {
          if (s.didJustFinish) { setStatus({ playing: false, pos: 0, loading: false }); void p!.seekTo(0).catch(() => {}); if (current === p) current = null; return; }
          setStatus({ playing: s.playing, pos: s.currentTime || 0, loading: !s.isLoaded });
        });
        player.current = p;
        setStatus(s => ({ ...s, loading: true }));
      }
      if (p.playing) { p.pause(); return; }
      if (current && current !== p) { try { current.pause(); } catch { /* gone */ } }
      current = p;
      p.play();
    } catch { setFailed(true); }
  };
  if (failed) return <Text style={{ fontSize: 15, color: t.fg }}>{WORDS.unplayable}</Text>;
  const done = secs ? Math.min(1, status.pos / secs) : 0, faint = mine ? 'rgba(255,255,255,0.4)' : t.dim;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? WORDS.pause : WORDS.play} onPress={toggle} style={[styles.play, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : t.surface }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={t.fg} />
      </Pressable>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: secs || 0, now: Math.round(status.pos) }} style={styles.bars}>
        {bars.map((b, i) => <View key={i} style={{ flex: 1, height: `${b}%`, minHeight: 3, borderRadius: 2, backgroundColor: (i + 0.5) / bars.length <= done ? t.fg : faint }} />)}
      </View>
      <Text style={{ fontSize: 13, color: mine ? '#E6E8FF' : t.muted, minWidth: 36, textAlign: 'right' }}>{chatSecs(status.playing || status.pos ? status.pos : secs) as string}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220 },
  play: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, height: 30, flexDirection: 'row', alignItems: 'center', gap: 2 },
});
