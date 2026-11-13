// The pieces the support screens share: photos to send with a message (taken with the camera, sent to the Worker as they are taken and named in the message
// by the ids that come back) and a picture in a thread, which is fetched with the session. The limit and the words are the web app's (shared/field-core.js).
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SUPPORT_PIC_FAILED, SUPPORT_PICS_MAX, supportFilePath, supportPicLimit } from '@shared/field-core.js';
import { API_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { uploadSupportPic } from '@/lib/upload';
import { Body, Button, Problem } from '@/ui';

export type Pic = { id: string; uri: string };

export function SupportPics({ pics, onChange, onBusy, disabled }: { pics: Pic[]; onChange: (p: Pic[]) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const { sessionId } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const snap = async () => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    setBusy(true); onBusy(true);
    try { onChange([...pics, { id: await uploadSupportPic(sessionId(), a.uri, a.mimeType || 'image/jpeg', SUPPORT_PIC_FAILED as string), uri: a.uri }]); }
    catch (e) { setProblem(e instanceof Error ? e.message : SUPPORT_PIC_FAILED as string); }
    setBusy(false); onBusy(false);
  };
  return (
    <View style={{ gap: 8 }}>
      {pics.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {pics.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} disabled={disabled} onPress={() => onChange(pics.filter(x => x !== p))}>
              <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} accessibilityLabel={`Photo ${i + 1}`} />
              <Body tone="muted">Remove</Body>
            </Pressable>
          ))}
        </View>
      )}
      {pics.length < (SUPPORT_PICS_MAX as number) && <Button kind="plain" icon="camera-outline" onPress={() => { void snap(); }} busy={busy} disabled={disabled}>{pics.length ? 'Take another photo' : 'Take a photo of the screen'}</Button>}
      <Body tone="muted">{supportPicLimit as string}</Body>
      <Problem>{problem}</Problem>
    </View>
  );
}

// A picture on a message in a thread.
export function SupportImage({ id }: { id: string }) {
  const { sessionId } = useSession();
  const sid = sessionId();
  return <Image accessibilityLabel="Screenshot" source={{ uri: `${API_URL.replace(/\/+$/, '')}/api/hr${supportFilePath(id) as string}`, headers: sid ? { Authorization: `Bearer ${sid}` } : undefined }} style={{ width: 160, height: 120, borderRadius: 8 }} resizeMode="cover" />;
}
