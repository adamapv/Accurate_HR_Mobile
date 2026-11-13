// Where the app starts. The task that sends what is waiting with the app closed has to be defined before any screen exists, because the phone can start
// the app with no screen at all just to run it; then the screens load as usual.
import './src/lib/background';
import 'expo-router/entry';
