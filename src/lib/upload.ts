// Sends a photo through the Worker's two-step upload, as the web app does: ask where it goes and what it will be known by, then PUT the bytes with the session.
import type { Api } from './api-core';
import { API_URL } from './config';

// `to` is the route that says where this kind of file goes (a checklist photo by default; '/expense-receipts/upload-url' for a receipt).
export async function uploadPhoto(api: Api, session: string | null, uri: string, mime = 'image/jpeg', to = '/documents/upload-url', filename = 'check.jpg'): Promise<string> {
  const prep = await api<{ upload_path: string; r2_key: string }>(to, { method: 'POST', body: { filename } });
  const bytes = await (await fetch(uri)).blob();
  let res: Response;
  try {
    res = await fetch(`${API_URL.replace(/\/+$/, '')}${prep.upload_path}`, { method: 'PUT', body: bytes, headers: { 'content-type': mime, ...(session ? { Authorization: `Bearer ${session}` } : {}) } });
  } catch { throw new Error('No connection. A photo needs signal.'); }
  if (!res.ok) {
    let msg = 'Upload failed. Try again.';
    try { const j = await res.json(); if (j?.error) msg = String(j.error).charAt(0).toUpperCase() + String(j.error).slice(1); } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return prep.r2_key;
}

// A picture for a support request: its bytes go straight to the Worker, which answers with the id the message then names. `failed` is what to say when
// the Worker gives no reason of its own.
export async function uploadSupportPic(session: string | null, uri: string, mime = 'image/jpeg', failed = 'Upload failed. Try again.'): Promise<string> {
  const bytes = await (await fetch(uri)).blob();
  let res: Response;
  try {
    res = await fetch(`${API_URL.replace(/\/+$/, '')}/api/hr/support/files`, { method: 'PUT', body: bytes, headers: { 'content-type': mime, ...(session ? { Authorization: `Bearer ${session}` } : {}) } });
  } catch { throw new Error('No connection. A photo needs signal.'); }
  let j: { ok?: boolean; error?: string; file?: { id: string } } = {};
  try { j = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || j.ok === false || !j.file?.id) throw new Error(j.error ? String(j.error).charAt(0).toUpperCase() + String(j.error).slice(1) : failed);
  return j.file.id;
}
