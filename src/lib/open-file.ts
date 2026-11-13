// Opens a file the Worker serves (a document, a receipt) in whatever app the phone has for it: it is fetched with the session into the phone's temporary folder,
// handed to the share sheet, and deleted again as soon as the sheet closes, so nothing of one person's is left on the phone for the next.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_URL } from './config';

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'text/plain': 'txt',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
const safe = (name: string) => name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';

// `path` is the Worker's own ('/documents/<id>/download'); `name` is what the file is called (its extension is taken from `mime` when it has none).
export async function openFile(session: string | null, path: string, name: string, mime?: string | null): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone has nothing to open the file with.');
  const ext = /\.[A-Za-z0-9]{2,5}$/.test(name) ? '' : `.${EXT[String(mime || '').split(';')[0].trim()] || 'bin'}`;
  const target = new File(Paths.cache, `${safe(name)}${ext}`);
  let file: File;
  try {
    file = await File.downloadFileAsync(`${API_URL.replace(/\/+$/, '')}/api/hr${path}`, target, { headers: session ? { Authorization: `Bearer ${session}` } : {}, idempotent: true });
  } catch { throw new Error('Couldn’t fetch the file. It needs signal.'); }
  try { await Sharing.shareAsync(file.uri, mime ? { mimeType: String(mime).split(';')[0].trim() } : undefined); }
  finally { try { file.delete(); } catch { /* already gone */ } }
}
