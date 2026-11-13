// Hands something from one screen to the next that is too big for an address (what the job card form opens on when Start needs a cost centre chosen).
// Kept only in memory, for the one hop: the next screen takes it once.
const held = new Map<string, unknown>();
let seq = 0;
export function hand(value: unknown): string { const token = `h${++seq}`; held.set(token, value); return token; }
export function take<T>(token: string | undefined): T | null { if (!token || !held.has(token)) return null; const v = held.get(token) as T; return v; }
export function drop(token: string | undefined) { if (token) held.delete(token); }
