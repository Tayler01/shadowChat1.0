import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { registerNativeNotificationBackgroundTask } from './background';
import { NOTIFICATION_CHANNEL_SCHEMA_VERSION } from './config';
import { getFreshDevicePushTokenAsync } from './freshDevicePushToken';
import { runNotificationStage } from './registrationPipeline';
import type { NativeNotificationStage } from './stages';

const INSTALLATION_KEY = 'shadowchat-native-notification-installation-v2';
const DEVICE_OPT_OUT_KEY = 'shadowchat-native-notification-device-opt-out-v2';
const INSTALLATION_CREDENTIAL_KEY =
  'shadowchat-native-notification-installation-credential-v2';
const LEGACY_ENROLLMENT_COMPLETE_KEY =
  'shadowchat-native-notification-enrollment-complete-v2';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTALLATION_CREDENTIAL_PATTERN = /^[0-9a-f]{64}$/i;
const CREDENTIAL_RPC_TIMEOUT_MS = 12_000;
const DEVICE_ONLY_SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type NativeNotificationInstallationCredential = {
  installationKey: string;
  userId: string;
  credential: string;
};

export class NativeNotificationCredentialRejectedError extends Error {
  constructor() {
    super('This notification device credential is no longer valid.');
    this.name = 'NativeNotificationCredentialRejectedError';
  }
}

export const isNativeNotificationCredentialRejectedError = (
  value: unknown
) => value instanceof NativeNotificationCredentialRejectedError;

export const getNativeNotificationInstallationKey = async () => {
  const stored = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (stored && UUID_PATTERN.test(stored)) {
    await SecureStore.setItemAsync(
      INSTALLATION_KEY,
      stored,
      DEVICE_ONLY_SECURE_STORE_OPTIONS
    );
    return stored;
  }
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(
    INSTALLATION_KEY,
    created,
    DEVICE_ONLY_SECURE_STORE_OPTIONS
  );
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

export const getNativeNotificationInstallationCredential = async () => {
  const stored = await SecureStore.getItemAsync(INSTALLATION_CREDENTIAL_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<
      NativeNotificationInstallationCredential
    >;
    if (
      typeof parsed.installationKey !== 'string' ||
      !UUID_PATTERN.test(parsed.installationKey) ||
      typeof parsed.userId !== 'string' ||
      !UUID_PATTERN.test(parsed.userId) ||
      typeof parsed.credential !== 'string' ||
      !INSTALLATION_CREDENTIAL_PATTERN.test(parsed.credential)
    ) {
      return null;
    }
    return parsed as NativeNotificationInstallationCredential;
  } catch {
    return null;
  }
};

const setNativeNotificationInstallationCredential = async (
  credential: NativeNotificationInstallationCredential
) => {
  await SecureStore.setItemAsync(
    INSTALLATION_CREDENTIAL_KEY,
    JSON.stringify(credential),
    DEVICE_ONLY_SECURE_STORE_OPTIONS
  );
  await SecureStore.deleteItemAsync(LEGACY_ENROLLMENT_COMPLETE_KEY);
};

export const clearNativeNotificationInstallationCredential = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(INSTALLATION_CREDENTIAL_KEY),
    SecureStore.deleteItemAsync(LEGACY_ENROLLMENT_COMPLETE_KEY),
  ]);
};

const getEasProjectId = () => {
  const easProjectId = Constants.easConfig?.projectId;
  if (easProjectId) return easProjectId;
  const extra = Constants.expoConfig?.extra as {
    eas?: { projectId?: string };
  } | undefined;
  return extra?.eas?.projectId ?? null;
};

const getExpoPushToken = async (
  devicePushToken: Notifications.DevicePushToken,
  onStage?: (stage: NativeNotificationStage) => void
) => {
  const projectId = getEasProjectId();
  if (!projectId) {
    throw new Error('This build is missing its EAS project ID.');
  }
  onStage?.('requesting_expo_token');
  return runNotificationStage({
    stage: 'requesting_expo_token',
    operation: () => Notifications.getExpoPushTokenAsync({
      projectId,
      devicePushToken,
    }),
  });
};

const getPublicSupabaseConfiguration = () => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('This build is missing its public Supabase configuration.');
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
    supabaseAnonKey,
  };
};

const invokeInstallationCredentialRpc = async <T>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = CREDENTIAL_RPC_TIMEOUT_MS
) => {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfiguration();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`Notification device update failed (${response.status}).`);
  }
  return await response.json() as T;
};

const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const confirmEnrollmentAfterTransportFailure = async ({
  installationKey,
  installationCredential,
  expoPushToken,
}: {
  installationKey: string;
  installationCredential: string;
  expoPushToken: string;
}) => {
  for (const delay of [0, 250, 750, 1_500]) {
    if (delay > 0) await wait(delay);
    const confirmed = await invokeInstallationCredentialRpc<boolean>(
      'register_native_notification_token_by_credential_v2',
      {
        target_installation_key: installationKey,
        target_credential: installationCredential,
        target_token: expoPushToken,
      },
      4_000
    ).catch(() => false);
    if (confirmed === true) return true;
  }
  return false;
};

const redeemNativeNotificationEnrollmentTicket = async ({
  ticket,
  requestId,
  installationKey,
  verifier,
  installationCredential,
  enrollmentUserId,
  expoPushToken,
}: {
  ticket: string;
  requestId: string;
  installationKey: string;
  verifier: string;
  installationCredential: string;
  enrollmentUserId: string;
  expoPushToken: string;
}) => {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfiguration();

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/redeem_native_notification_enrollment_ticket_v2`,
      {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        target_ticket: ticket,
        target_request_id: requestId,
        target_installation_key: installationKey,
        target_verifier: verifier,
        target_installation_credential: installationCredential,
        target_platform: Platform.OS === 'ios' ? 'ios' : 'android',
        target_app_version: Application.nativeApplicationVersion,
        target_build_number: Application.nativeBuildVersion,
        target_locale: Intl.DateTimeFormat().resolvedOptions().locale,
        target_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        target_channel_schema_version: NOTIFICATION_CHANNEL_SCHEMA_VERSION,
        target_token: expoPushToken,
      }),
      }
    );
  } catch (caught) {
    const confirmed = await confirmEnrollmentAfterTransportFailure({
      installationKey,
      installationCredential,
      expoPushToken,
    });
    if (confirmed === true) {
      await setNativeNotificationInstallationCredential({
        installationKey,
        userId: enrollmentUserId,
        credential: installationCredential,
      });
      return;
    }
    throw caught;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    let message = `Notification enrollment failed (${response.status}).`;
    try {
      const payload = await response.json() as { message?: unknown };
      if (typeof payload.message === 'string' && payload.message.length <= 240) {
        message = payload.message;
      }
    } catch {
      // Keep the bounded status-only fallback.
    }
    throw new Error(message);
  }
  const payload = await response.json() as {
    user_id?: unknown;
    installation_id?: unknown;
  };
  if (
    typeof payload.user_id !== 'string' ||
    !UUID_PATTERN.test(payload.user_id) ||
    payload.user_id !== enrollmentUserId ||
    typeof payload.installation_id !== 'string' ||
    !UUID_PATTERN.test(payload.installation_id)
  ) {
    throw new Error('Notification enrollment returned an invalid device credential.');
  }
  await setNativeNotificationInstallationCredential({
    installationKey,
    userId: payload.user_id,
    credential: installationCredential,
  });
};

export const refreshNativeNotificationToken = async (
  devicePushToken: Notifications.DevicePushToken
) => {
  if (await getNativeNotificationDeviceOptOut()) return;
  const installation = await getNativeNotificationInstallationCredential();
  if (!installation) return;
  const token = await getExpoPushToken(devicePushToken);
  const updated = await invokeInstallationCredentialRpc<boolean>(
    'register_native_notification_token_by_credential_v2',
    {
      target_installation_key: installation.installationKey,
      target_credential: installation.credential,
      target_token: token.data,
    }
  );
  if (updated !== true) {
    throw new NativeNotificationCredentialRejectedError();
  }
  return true;
};

export const reconcileNativeNotificationInstallation = async () => {
  if (await getNativeNotificationDeviceOptOut()) return false;
  if (!await getNativeNotificationInstallationCredential()) return false;
  const devicePushToken = await getFreshDevicePushTokenAsync();
  return refreshNativeNotificationToken(devicePushToken);
};

export const registerNativeNotificationInstallation = async ({
  requestPermission,
  enrollmentTicket,
  enrollmentVerifier,
  installationCredential,
  enrollmentUserId,
  requestId,
  onStage,
  onPermission,
}: {
  requestPermission: boolean;
  enrollmentTicket: string;
  enrollmentVerifier: string;
  installationCredential: string;
  enrollmentUserId: string;
  requestId: string;
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

  const installationKey = await runNotificationStage({
    stage: 'registering_installation',
    operation: getNativeNotificationInstallationKey,
  });

  onStage?.('requesting_device_token');
  const devicePushToken = await runNotificationStage({
    stage: 'requesting_device_token',
    operation: getFreshDevicePushTokenAsync,
  });
  const expoPushToken = await getExpoPushToken(devicePushToken, onStage);
  onStage?.('registering_installation');
  await runNotificationStage({
    stage: 'registering_installation',
    operation: () => redeemNativeNotificationEnrollmentTicket({
      ticket: enrollmentTicket,
      requestId,
      installationKey,
      verifier: enrollmentVerifier,
      installationCredential,
      enrollmentUserId,
      expoPushToken: expoPushToken.data,
    }),
  });

  return { enabled: true, permission: permissions.status };
};

let requestedForegroundState = false;
let foregroundLeaseRequest: Promise<boolean> | null = null;

const sendNativeNotificationForegroundLease = async (foreground: boolean) => {
  const installation = await getNativeNotificationInstallationCredential();
  if (!installation) return false;
  const updated = await invokeInstallationCredentialRpc<boolean>(
    'set_notification_installation_foreground_by_credential_v2',
    {
      target_installation_key: installation.installationKey,
      target_credential: installation.credential,
      target_foreground_until: foreground
        ? new Date(Date.now() + 90_000).toISOString()
        : null,
    }
  );
  if (updated !== true) {
    throw new NativeNotificationCredentialRejectedError();
  }
  return true;
};

export const updateNativeNotificationForegroundLease = (
  foreground: boolean
) => {
  requestedForegroundState = foreground;
  if (foregroundLeaseRequest) return foregroundLeaseRequest;

  const request = (async () => {
    let updated = false;
    while (true) {
      const targetState = requestedForegroundState;
      updated = await sendNativeNotificationForegroundLease(targetState);
      if (targetState === requestedForegroundState) return updated;
    }
  })();
  foregroundLeaseRequest = request.finally(() => {
    foregroundLeaseRequest = null;
  });
  return foregroundLeaseRequest;
};

export const revokeNativeNotificationInstallation = async () => {
  const installation = await getNativeNotificationInstallationCredential();
  if (!installation) {
    await clearNativeNotificationInstallationCredential();
    return true;
  }
  const revoked = await invokeInstallationCredentialRpc<boolean>(
    'revoke_notification_installation_by_credential_v2',
    {
      target_installation_key: installation.installationKey,
      target_credential: installation.credential,
    }
  );
  if (revoked !== true) {
    await clearNativeNotificationInstallationCredential();
    return true;
  }
  await clearNativeNotificationInstallationCredential();
  return true;
};
