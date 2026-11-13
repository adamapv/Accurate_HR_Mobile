import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra || {}) as { apiUrl?: string; env?: string; build?: number; commit?: string };
// Where the Worker is. Fixed when the app is built (app.config.js).
export const API_URL = extra.apiUrl || 'https://app.accuratehr.co';
export const APP_ENV = extra.env || 'production';
// Sent on every call, so the Worker knows which app is asking.
export const APP_VERSION = `${Constants.expoConfig?.version || '0.0.0'} ${Platform.OS}`;
// Which build this is, as the More tab says it: "0.1.0 · build 57 (1a2b3c4)". The number goes up with every build made on GitHub and is the one in the name of
// the file that was installed; a build made on someone's own computer is "dev".
export const APP_BUILD = `${Constants.expoConfig?.version || '0.0.0'} · build ${extra.build || 'dev'}${extra.commit ? ` (${extra.commit})` : ''}`;
