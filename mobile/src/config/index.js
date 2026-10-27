export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/api/v1';

export const OAUTH = {
  googleAndroid: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  googleWeb: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIos: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  facebook: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
  github: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID,
};
