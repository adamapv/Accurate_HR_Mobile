import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra || {}) as { apiUrl?: string; env?: string };
// Where the Worker is. Fixed when the app is built (app.config.js).
export const API_URL = extra.apiUrl || 'https://app.accuratehr.co';
export const APP_ENV = extra.env || 'production';
// Sent on every call, so the Worker knows which app is asking.
export const APP_VERSION = `${Constants.expoConfig?.version || '0.0.0'} ${Platform.OS}`;
