// Where the app starts. The screens' own start comes first, so everything it sets up is in place. Then two things that have to exist before any screen
// does: the note of an error the app cannot carry on from (src/lib/crash.ts), and the task that sends what is waiting with the app closed, which the phone
// can start with no screen at all (src/lib/background.ts).
import 'expo-router/entry';
import './src/lib/crash';
import './src/lib/background';
