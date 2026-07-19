import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';
import { NOTIFICATION_CHANNEL_SCHEMA_VERSION } from './config';

const INSTALLATION_KEY = 'shadowchat-native-notification-installation-v2';

const createUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    const nibble = character === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });

export const getNativeNotificationInstallationKey = async () => {
  const stored = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (stored) return stored;
  const created = createUuid();
  await SecureStore.setItemAsync(INSTALLATION_KEY, created);
  return created;
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
  return Constants.expoConfig?.extra?.notificationEnvironment === 'preview'
    ? 'preview'
    : 'production';
};

export const registerNativeNotificationInstallation = async ({
  requestPermission,
}: {
  requestPermission: boolean;
}) => {
  if (!Device.isDevice) {
    throw new Error('Remote notifications require a physical iPhone or Android device.');
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    throw new Error('This build is missing its EAS project ID.');
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = (
    requestPermission && currentPermissions.status !== 'granted'
      ? await Notifications.requestPermissionsAsync()
      : currentPermissions
  );
  if (permissions.status !== 'granted') {
    return { enabled: false, permission: permissions.status };
  }

  const installationKey = await getNativeNotificationInstallationKey();
  const client = getSupabase();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const environment = getEnvironment();
  const { error: installationError } = await client.rpc(
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
  );
  if (installationError) throw installationError;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error: tokenError } = await client.rpc(
    'register_my_native_notification_token_v2',
    {
      target_installation_key: installationKey,
      target_provider: 'expo',
      target_environment: environment,
      target_token: token.data,
    }
  );
  if (tokenError) throw tokenError;

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
