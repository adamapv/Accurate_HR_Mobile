// How the app talks to the AccurateHR Worker, with nothing from React Native in it so scripts/test-api.mjs can run it in Node.
// The app signs in with a company code, an email and a PIN; the answer carries the session id, which is then sent as a Bearer header on every call (no cookie).
// The company code goes only on the sign-in routes, as the web app sends it. Every call says which version of the app is asking.

// The sign-in routes: the only ones that run with no session, and the only ones that are told the company code.
export const TENANT_ROUTES = new Set(['/bootstrap-check', '/bootstrap', '/login', '/passkeys/login/options', '/passkeys/login']);

// A call that did not work. `status` is the Worker's answer (401, 403, 409…); with no signal there is no answer and no status, which is how the outbox tells
// "keep it and try again" from "the server said no". `code` is the Worker's own word for a few cases the app acts on ('must_change_pin').
export class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
  get offline() { return this.status === undefined; }
}

export type ApiOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; params?: Record<string, string | number | boolean | null | undefined>; signal?: AbortSignal };
export type Api = <T = any>(path: string, opts?: ApiOptions) => Promise<T>;
type Deps = {
  baseUrl: string;                              // https://app.accuratehr.co
  appVersion: string;                           // '0.1.0 android'
  getSession: () => string | null;
  getTenantCode: () => string | null;
  onSignedOut?: () => void;                     // the session was refused on an ordinary call: it has ended
  fetchImpl?: typeof fetch;
};

export function createApi({ baseUrl, appVersion, getSession, getTenantCode, onSignedOut, fetchImpl = fetch }: Deps): Api {
  return async function api(path, { method = 'GET', body, params, signal } = {}) {
    const query = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    const url = `${baseUrl.replace(/\/+$/, '')}/api/hr${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json', 'X-App-Version': appVersion };
    const sid = getSession();
    if (sid) headers.Authorization = `Bearer ${sid}`;
    const route = path.split('?')[0];
    const code = TENANT_ROUTES.has(route) ? getTenantCode() : null;
    if (code) headers['X-Tenant-Code'] = code;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchImpl(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
    } catch {
      throw new ApiError('No connection. Check your signal and try again.');
    }
    let json: any = null;
    try { json = await res.json(); } catch { /* not JSON: an error page from something in between */ }
    if (!res.ok || !json || json.ok === false) {
      if (res.status === 401 && sid && !TENANT_ROUTES.has(route)) onSignedOut?.();
      throw new ApiError(json?.error ? sentence(json.error) : `Something went wrong (${res.status}). Try again.`, res.status, json?.code);
    }
    return json;
  };
}

// The Worker's errors start in lower case ("incorrect email or PIN…"), as the web app shows them after a capital.
export const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
