// Where the session, the company code and the last email are kept in the phone's secure store. In a file of their own so the task that sends what is waiting
// with the app closed can read them without loading any screen code.
export const SESSION_KEY = 'hrhead_session', TENANT_KEY = 'hrhead_tenant', EMAIL_KEY = 'hrhead_last_email';
// Kept beside the offline copies, so it goes when the app is deleted (an iPhone's Keychain does not): see src/lib/fresh-install-core.ts.
export const INSTALL_MARKER = 'hrhead_install';
