// The company's shared documents: the folders it shares with the person, browsed a folder at a time, and a file opened in whatever the phone has for it.
// Which folders show is the Worker's call; the way back up, a file's line, where a listing and a file come from and the words are the web app's own rules
// (shared/field-core.js). It needs signal, and a file fetched to open is deleted again as soon as the share sheet closes.
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { SHARED_DOCS, SHARED_FOLDER_EMPTY, sharedCrumbs, sharedDown, sharedEmpty, sharedEntryMeta, sharedFilePath, sharedJoin, sharedListPath, sharedReady, sharedSaid, sharedUp } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate } from '@/lib/dates';
import { openFile } from '@/lib/open-file';
import { Body, Button, Empty, List, Notice, Problem, Row, Screen, Title } from '@/ui';

type Folder = { id: string; label: string };
type Entry = { type: 'folder' | 'file'; name: string; size: number | null; modified: string | null };
type Listing = { folder: Folder; path: string; entries: Entry[] };
type Crumb = { label: string; path: string; here: boolean };
const day = (d: string) => fmtDate(String(d).slice(0, 10));

export default function SharedDocs() {
  const { state, sessionId } = useSession();
  const shared = useRead<{ connected: boolean; folders: Folder[] }>('/dropbox/shared');
  const [folder, setFolder] = useState<Folder | null>(null);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const listing = useRead<Listing>(folder ? sharedListPath(folder.id, path) as string : null);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const isAdmin = ['admin', 'owner'].includes(state.me.employee.role);

  if (!folder) {
    const d = shared.data;
    return (
      <Screen>
        <Title>{SHARED_DOCS as string}</Title>
        <Problem>{shared.error}</Problem>
        {!d ? (!shared.error && <Body tone="muted">Loading…</Body>) : d.folders.length === 0 ? <Empty icon="folder-open-outline">{sharedSaid(sharedEmpty(isAdmin)) as string}</Empty> : (
          <>
            {!d.connected && <Notice tone="warn">{sharedSaid(sharedDown(isAdmin)) as string}</Notice>}
            <List>
              {d.folders.map((f, n) => <Row key={f.id} icon="folder-outline" tint="blue" title={f.label} onPress={() => { setProblem(''); setPath(''); setFolder(f); }} last={n === d.folders.length - 1} />)}
            </List>
          </>
        )}
      </Screen>
    );
  }

  const crumbs = sharedCrumbs(folder, path) as Crumb[], here = crumbs[crumbs.length - 1];
  const up = sharedUp(path) as string | null;
  const ready = sharedReady(listing.data, folder, path) as boolean;
  const open = async (e: Entry) => {
    setBusy(e.name); setProblem('');
    try { await openFile(sessionId(), sharedFilePath(folder.id, sharedJoin(path, e.name)) as string, e.name); }
    catch (err) { setProblem(err instanceof Error ? err.message : 'Couldn’t open the file.'); }
    setBusy('');
  };
  return (
    <Screen>
      <Title>{here.label}</Title>
      {crumbs.length > 1 && <Body tone="muted">{crumbs.map(c => c.label).join(' / ')}</Body>}
      <Button kind="plain" icon="arrow-up-outline" onPress={() => { setProblem(''); if (up === null) setFolder(null); else setPath(up); }} disabled={!!busy}>{up === null ? (SHARED_DOCS as string) : crumbs[crumbs.length - 2].label}</Button>
      <Problem>{problem || listing.error}</Problem>
      {!ready ? (!listing.error && <Body tone="muted">Loading…</Body>) : listing.data!.entries.length === 0 ? <Empty icon="folder-open-outline">{SHARED_FOLDER_EMPTY as string}</Empty> : (
        <List>
          {listing.data!.entries.map((e, n, all) => e.type === 'folder'
            ? <Row key={e.name} icon="folder-outline" tint="blue" title={e.name} onPress={() => { setProblem(''); setPath(sharedJoin(path, e.name) as string); }} last={n === all.length - 1} />
            : <Row key={e.name} icon="document-outline" tint="slate" title={e.name} sub={busy === e.name ? 'Opening…' : sharedEntryMeta(e, day) as string} onPress={busy ? undefined : () => { void open(e); }} last={n === all.length - 1} />)}
        </List>
      )}
    </Screen>
  );
}
