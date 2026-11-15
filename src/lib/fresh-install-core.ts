// An iPhone keeps what is in its Keychain after the app is deleted, so a phone that had the app taken off and put back on would open already signed in as the
// last person. Everything else the app keeps (the outbox, the copies for reading with no signal, this marker) goes with the app. So on an iPhone, a start that
// finds no marker is the first start of this install: whatever the Keychain still holds is forgotten, and the marker is written. Android removes its secure
// store with the app, so nothing happens there.
export type InstallStore = {
  platform: string;
  getMarker: () => Promise<string | null>;
  setMarker: () => Promise<void>;
  forgetKept: () => Promise<void>;   // what the secure store holds: the session, the company code, the last email
};

export async function checkFreshInstall(s: InstallStore): Promise<boolean> {
  if (s.platform !== 'ios') return false;
  try {
    if (await s.getMarker()) return false;
    await s.forgetKept();
    await s.setMarker();
    return true;
  } catch { return false; /* cannot tell: leave things as they are rather than sign someone out of a working app */ }
}
