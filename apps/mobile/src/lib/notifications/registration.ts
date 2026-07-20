import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';
import { registerNativeNotificationBackgroundTask } from './background';
import { NOTIFICATION_CHANNEL_SCHEMA_VERSION } from './config';
import { getFreshDevicePushTokenAsync } from './freshDevicePushToken';
import { runNotificationStage } from './registrationPipeline';
import type { NativeNotificationStage } from '../nativeAppBridge';

const INSTALLATION_KEY = 'shadowchat-native-notification-installation-v2';
const DEVICE_OPT_OUT_KEY = 'shadowchat-native-notification-device-opt-out-v2';

export const getNativeNotificationInstallationKey = async () => {
  const stored = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (stored) return stored;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY, created);
  return created;
};

export const getNativeNotificationDeviceOptOut = async () =>
  (await SecureStore.getItemAsync(DEVICE_OPT_OUT_KEY)) === 'true';

export const setNativeNotificationDeviceOptOut = async (optedOut: boolean) => {
  if (optedOut) {
    await SecureStore.setItemAsync(DEVICE_OPT_OUT_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(DEVICE_OPT_OUT_KEY);
  }
};

const getEasProjectId = () => {
  const easProjectId = Constants.easConfig?.projectId;
  if (easProjectId) return easProjectId;
  const extra = Constants.expoConfig?.extra as {
    eas?: { projectId?: string };
  } | undefined;
  return extra?.eas?.projectId ?? null;
};

const getEnvironment = () => {
  if (__DEV__) return 'development';
  const configured = process.env.EXPO_PUBLIC_NOTIFICATION_ENVIRONMENT;
  if (
    configured === 'development' ||
    configured === 'preview' ||
    configured === 'production'
  ) {
    return configured;
  }
  throw new Error('This build is missing its notification environment.');
};

const persistExpoPushToken = async (
  devicePushToken: Notifications.DevicePushToken,
  onStage?: (stage: NativeNotificationStage) => void
) => {
  const projectId = getEasProjectId();
  if (!projectId) {
    throw new Error('This build is missing its EAS project ID.');
  }
  const installationKey = await getNativeNotificationInstallationKey();
  const environment = getEnvironment();
  onStage?.('requesting_expo_token');
  const token = await runNotificationStage({
    stage: 'requesting_expo_token',
    operation: () => Notifications.getExpoPushTokenAsync({
      projectId,
      devicePushToken,
    }),
  });
  onStage?.('registering_token');
  const { error } = await runNotificationStage({
    stage: 'registering_token',
    operation: async () =>
      await getSupabase().rpc(
        'register_my_native_notification_token_v2',
        {
          target_installation_key: installationKey,
          target_provider: 'expo',
          target_environment: environment,
          target_token: token.data,
        }
      ),
  });
  if (error) throw error;
};

export const refreshNativeNotificationToken = async (
  devicePushToken: Notifications.DevicePushToken
) => {
  if (await getNativeNotificationDeviceOptOut()) return;
  await persistExpoPushToken(devicePushToken);
};

export const registerNativeNotificationInstallation = async ({
  requestPermission,
  onStage,
  onPermission,
}: {
  requestPermission: boolean;
  onStage?: (stage: NativeNotificationStage) => void;
  onPermission?: (permission: Notifications.PermissionStatus) => void;
}) => {
  if (!Device.isDevice) {
    throw new Error('Remote notifications require a physical iPhone or Android device.');
  }
  onStage?.('reading_permission');
  const optedOut = await runNotificationStage({
    stage: 'reading_permission',
    operation: getNativeNotificationDeviceOptOut,
  });
  if (optedOut) {
    const currentPermissions = await runNotificationStage({
      stage: 'reading_permission',
      operation: Notifications.getPermissionsAsync,
    });
    onPermission?.(currentPermissions.status);
    return { enabled: false, permission: currentPermissions.status };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    throw new Error('This build is missing its EAS project ID.');
  }

  const currentPermissions = await runNotificationStage({
    stage: 'reading_permission',
    operation: Notifications.getPermissionsAsync,
  });
  if (requestPermission && currentPermissions.status !== 'granted') {
    onStage?.('requesting_permission');
  }
  const permissions = (
    requestPermission && currentPermissions.status !== 'granted'
      ? await runNotificationStage({
          stage: 'requesting_permission',
          operation: Notifications.requestPermissionsAsync,
        })
      : currentPermissions
  );
  onPermission?.(permissions.status);
  if (permissions.status !== 'granted') {
    return { enabled: false, permission: permissions.status };
  }
  await registerNativeNotificationBackgroundTask();

  onStage?.('registering_installation');
  const installationKey = await runNotificationStage({
    stage: 'registering_installation',
    operation: getNativeNotificationInstallationKey,
  });
  const client = getSupabase();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const environment = getEnvironment();
  const { error: installationError } = await runNotificationStage({
    stage: 'registering_installation',
    operation: async () =>
      await client.rpc(
        'register_my_notification_installation_v2',
        {
          target_installation_key: installationKey,
          target_platform: platform,
          target_app_id: Application.applicationId ?? 'com.shadowchat.mobile',
          target_project_id: projectId,
          target_environment: environment,
          target_app_version: Application.nativeApplicationVersion,
          target_build_number: Application.nativeBuildVersion,
          target_locale: Intl.DateTimeFormat().resolvedOptions().locale,
          target_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          target_channel_schema_version: NOTIFICATION_CHANNEL_SCHEMA_VERSION,
        }
      ),
  });
  if (installationError) throw installationError;

  onStage?.('requesting_device_token');
  const devicePushToken = await runNotificationStage({
    stage: 'requesting_device_token',
    operation: getFreshDevicePushTokenAsync,
  });
  await persistExpoPushToken(devicePushToken, onStage);

  return { enabled: true, permission: permissions.status };
};

export const updateNativeNotificationForegroundLease = async (
  foreground: boolean
) => {
  const installationKey = await getNativeNotificationInstallationKey();
  const { error } = await getSupabase().rpc(
    'set_my_notification_installation_foreground_v2',
    {
      target_installation_key: installationKey,
      target_foreground_until: foreground
        ? new Date(Date.now() + 90_000).toISOString()
        : null,
    }
  );
  if (error) throw error;
};

export const revokeNativeNotificationInstallation = async () => {
  const installationKey = await getNativeNotificationInstallationKey();
  const { error } = await getSupabase().rpc(
    'revoke_my_notification_installation_v2',
    { target_installation_key: installationKey }
  );
  if (error) throw error;
};
