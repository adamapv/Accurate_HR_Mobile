// What the phone does in the hand: a light tap for a button, a tick for a choice, a firm double for something saved, a buzz for something refused, and a
// thud when a held message opens its choices. The phone's own setting for touch feedback decides whether anything is felt; a phone with no motor does nothing.
import * as Haptics from 'expo-haptics';

const quiet = (p: Promise<void>) => { p.catch(() => { /* no motor, or switched off */ }); };

export const feel = {
  tap: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  pick: () => quiet(Haptics.selectionAsync()),
  hold: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  saved: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  refused: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
