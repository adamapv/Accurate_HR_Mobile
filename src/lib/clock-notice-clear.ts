// Takes the on-the-clock notification down. In a file of its own so the session can do it on sign-out without loading any screen code.
import * as Notifications from 'expo-notifications';
import { CLOCK_NOTICE_ID } from './clock-notice-core';

export async function clearClockNotice() { try { await Notifications.dismissNotificationAsync(CLOCK_NOTICE_ID); } catch { /* none up */ } }
