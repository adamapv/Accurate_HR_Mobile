// The person's own photo on My HR, or their initials. Only they ever see it. With leave to change their own details they can take a new one with the camera
// or remove it. Where it is read from, what the buttons say and what is asked before it is removed are the web app's own rules (shared/field-core.js). The
// photo is taken square and sent as it is; the Worker refuses one that is too large, in its own words. It needs signal.
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { myPhotoPath, PHOTO_REMOVE_CONFIRM, PHOTO_WORDS, photoAction } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { API_URL } from '@/lib/config';
import { Avatar, Body, Button, Problem } from '@/ui';

const WORDS = PHOTO_WORDS as { remove: string; updated: string; removed: string; failed: string; onlyYou: string };
const ASK = PHOTO_REMOVE_CONFIRM as { title: string; body: string; confirmLabel: string };
const SIZE = 72;

export function MyPhoto({ name, photoKey, canEdit }: { name: string; photoKey: string | null | undefined; canEdit: boolean }) {
  const { api, refreshMe, sessionId, changed } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [broken, setBroken] = useState('');   // the photo that would not load, so the initials show instead
  const sid = sessionId();
  const base = API_URL.replace(/\/+$/, '');
  const take = async () => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.3, cameraType: ImagePicker.CameraType.front });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    setBusy(true);
    try {
      const bytes = await (await fetch(a.uri)).blob();
      const up = await fetch(`${base}/api/hr/me/photo`, { method: 'PUT', body: bytes, headers: { 'content-type': 'image/jpeg', ...(sid ? { Authorization: `Bearer ${sid}` } : {}) } });
      const j = await up.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!up.ok || j.ok === false) throw new Error(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : WORDS.failed);
      await refreshMe(); changed();
    } catch (e) { setProblem(e instanceof TypeError ? 'No signal. A photo needs signal.' : e instanceof Error ? e.message : WORDS.failed); }
    setBusy(false);
  };
  const remove = () => Alert.alert(ASK.title, ASK.body, [{ text: 'Cancel', style: 'cancel' }, { text: ASK.confirmLabel, style: 'destructive', onPress: () => {
    setBusy(true); setProblem('');
    api('/me/photo', { method: 'DELETE' }).then(() => refreshMe()).then(() => changed())
      .catch(e => setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.')).finally(() => setBusy(false));
  } }]);
  const shown = !!photoKey && broken !== photoKey;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {shown
          ? <Image source={{ uri: `${base}/api/hr${myPhotoPath(photoKey) as string}`, headers: sid ? { Authorization: `Bearer ${sid}` } : undefined }} onError={() => setBroken(photoKey || '')}
              style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }} accessibilityLabel="Your photo" />
          : <Avatar name={name} size={SIZE} />}
        {canEdit && (
          <View style={{ flex: 1, gap: 6 }}>
            <Button kind="plain" icon="camera-outline" onPress={() => { void take(); }} busy={busy}>{photoAction(photoKey) as string}</Button>
            {!!photoKey && <Button kind="plain" onPress={remove} disabled={busy}>{WORDS.remove}</Button>}
          </View>
        )}
      </View>
      {canEdit && <Body tone="muted">{WORDS.onlyYou}</Body>}
      <Problem>{problem}</Problem>
    </View>
  );
}
