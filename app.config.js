// One app, two builds: production talks to app.accuratehr.co; APP_ENV=staging makes a separate "AccurateHR (staging)" app that talks to staging.accuratehr.co and
// installs beside the real one. The address the app talks to is fixed at build time and never typed in by a person.
const fs = require('fs');
const path = require('path');
const staging = process.env.APP_ENV === 'staging';
// Every build has its own number, so the More tab can say exactly which one is on a phone. The Android build on GitHub passes its run number (the same number as in
// the name of the file it makes) and the commit it was built from; a build made any other way is "dev".
const build = Number(process.env.BUILD_NUMBER) || 0;
const commit = String(process.env.BUILD_COMMIT || '').slice(0, 7);

module.exports = {
  expo: {
    name: staging ? 'AccurateHR (staging)' : 'AccurateHR',
    slug: 'accuratehr',
    version: require('./package.json').version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: staging ? 'accuratehr-staging' : 'accuratehr',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0A0A12',
    ios: { bundleIdentifier: staging ? 'co.accuratehr.app.staging' : 'co.accuratehr.app', supportsTablet: false, buildNumber: String(build || 1) },
    android: {
      package: staging ? 'co.accuratehr.app.staging' : 'co.accuratehr.app',
      versionCode: build || 1,
      // The push service's own file (Firebase): notifications from the Worker reach the phone only in a build that has it.
      ...(fs.existsSync(path.join(__dirname, 'google-services.json')) ? { googleServicesFile: './google-services.json' } : {}),
      adaptiveIcon: { backgroundColor: '#3DA9E6', foregroundImage: './assets/images/android-icon-foreground.png' },
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      // The camera is used only for a photo (a checklist item, a chat, a card to scan); the app never reads the phone's photo library and never films.
      // Its microphone setting is left alone on purpose: switching it off here takes the microphone away from the whole app, and voice messages need it.
      ['expo-image-picker', { cameraPermission: 'AccurateHR uses the camera to take a photo for a checklist item.', photosPermission: false, microphonePermission: 'AccurateHR uses the microphone to record a voice message in a chat.' }],
      // The microphone is used only while a voice message is being recorded in a chat; nothing records or plays in the background.
      ['expo-audio', { microphonePermission: 'AccurateHR uses the microphone to record a voice message in a chat.', enableBackgroundRecording: false, enableBackgroundPlayback: false }],
      // The app lock asks the phone who is holding it; the app never sees a face or a fingerprint.
      ['expo-local-authentication', { faceIDPermission: 'AccurateHR uses Face ID to unlock the app when you have switched the app lock on.' }],
      // What is waiting on the phone is also sent now and then with the app closed.
      'expo-background-task',
      // A notification stays up while someone is on the clock. Nothing is pushed to the phone yet, so remote notifications are off.
      ['expo-notifications', { color: '#5468FF', enableBackgroundRemoteNotifications: false }],
      ['expo-splash-screen', { backgroundColor: '#0A0A12', image: './assets/images/splash-icon.png', imageWidth: 120 }],
    ],
    extra: { push: fs.existsSync(path.join(__dirname, 'google-services.json')), apiUrl: staging ? 'https://staging.accuratehr.co' : 'https://app.accuratehr.co', env: staging ? 'staging' : 'production', build, commit },
  },
};
