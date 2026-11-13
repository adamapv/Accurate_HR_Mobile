// One app, two builds: production talks to app.accuratehr.co; APP_ENV=staging makes a separate "AccurateHR (staging)" app that talks to staging.accuratehr.co and
// installs beside the real one. The address the app talks to is fixed at build time and never typed in by a person.
const staging = process.env.APP_ENV === 'staging';

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
    ios: { bundleIdentifier: staging ? 'co.accuratehr.app.staging' : 'co.accuratehr.app', supportsTablet: false },
    android: {
      package: staging ? 'co.accuratehr.app.staging' : 'co.accuratehr.app',
      adaptiveIcon: { backgroundColor: '#3DA9E6', foregroundImage: './assets/images/android-icon-foreground.png' },
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      ['expo-splash-screen', { backgroundColor: '#0A0A12', image: './assets/images/splash-icon.png', imageWidth: 120 }],
    ],
    extra: { apiUrl: staging ? 'https://staging.accuratehr.co' : 'https://app.accuratehr.co', env: staging ? 'staging' : 'production' },
  },
};
