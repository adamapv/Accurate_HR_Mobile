// Takes the on-the-clock notification down. In a file of its own so the session can do it on sign-out without loading any screen code.
import { SAFE_MODE } from './crash';
import { CLOCK_NOTICE_ID } from './clock-notice-core';

// The phone's notifications are loaded only when first needed, and never in safe mode.
const N = () => require('expo-notifications') as typeof import('expo-notifications');

export async function clearClockNotice() { if (SAFE_MODE) return; try { await N().dismissNotificationAsync(CLOCK_NOTICE_ID); } catch { /* none up */ } }
