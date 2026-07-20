import type * as Notifications from 'expo-notifications';
import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

type FreshPushTokenManager = {
  getDevicePushTokenAsync: () => Promise<string>;
};

let pushTokenManager: FreshPushTokenManager | null = null;

const getFreshPushTokenManager = () => {
  pushTokenManager ??=
    requireNativeModule<FreshPushTokenManager>('ExpoPushTokenManager');
  return pushTokenManager;
};

/**
 * Bypasses expo-notifications' module-level cached promise. On iOS the native
 * module deliberately replaces an older unresolved request when a new one
 * starts, allowing a timed-out APNs registration to recover without leaving
 * every later tap attached to the poisoned JavaScript promise.
 */
export const getFreshDevicePushTokenAsync = async () => {
  const data = await getFreshPushTokenManager().getDevicePushTokenAsync();
  return {
    type: Platform.OS === 'ios' ? 'ios' : 'android',
    data,
  } as Notifications.DevicePushToken;
};
