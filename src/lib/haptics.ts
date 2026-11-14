// What the phone does in the hand: a short tap for a button, a shorter tick for a choice, a double for something saved, a longer double for something
// refused, and a firmer tap when a held message opens its choices. It uses the phone's plain vibrator, which React Native has built in, so no extra native
// package is loaded when the app starts (the package first used for this is the likeliest cause of the app closing on opening from build 35, and was taken
// out). On an iPhone the plain vibrator has one fixed length, so a finer feel there waits for an iPhone build. A phone with no motor does nothing.
import { Platform, Vibration } from 'react-native';

const android = Platform.OS === 'android';
const buzz = (pattern: number | number[]) => { try { if (android) Vibration.vibrate(pattern); } catch { /* no motor, or not allowed */ } };

export const feel = {
  tap: () => buzz(12),
  pick: () => buzz(6),
  hold: () => buzz(25),
  saved: () => buzz([0, 30, 70, 30]),
  refused: () => buzz([0, 50, 90, 50]),
};
