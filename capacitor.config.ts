import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.savvylens.can',
  appName: 'SavvyLens',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
