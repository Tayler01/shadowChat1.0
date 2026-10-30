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

import { communityStorageKeys, type CommunityContext } from '../../community/communityRuntime';
import {
  baseAppRuntime,
  requireCommunity,
  isCurrentCommunity,
  runCommunityOperation,
  rememberInstallation,
} from '../../community/communityBindings';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTALLATION_CREDENTIAL_PATTERN = /^[0-9a-f]{64}$/i;
const CREDENTIAL_RPC_TIMEOUT_MS = 12_000;
const DEVICE_ONLY_SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const LEGACY_INSTALLATION_KEY = 'shadowchat-native-notification-installation-v2';
const LEGACY_CREDENTIAL_KEY = 'shadowchat-native-notification-installation-credential-v2';
// Startup migration and identifier reads must also serialize across facades.
const installationIdentityOperations = new Map<string, Promise<void>>();
function withInstallationIdentity<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (installationIdentityOperations.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  installationIdentityOperations.set(key, settled);
  void settled.then(() => {
    if (installationIdentityOperations.get(key) === settled) installationIdentityOperations.delete(key);
  });
  return result;
}

type PendingNativeEnrollment = {
  installationKey: string;
  userId: string;
  credential: string;
  ticket: string;
  requestId: string;
  verifier: string;
};

type NativeNotificationInstallationCredential = {
  installationKey: string;
  userId: string;
  credential: string;
  enrollmentPending?: boolean;
};

export class NativeNotificationCredentialRejectedError extends Error {
  constructor() {
    super('This notification device credential is no longer valid.');
    this.name = 'NativeNotificationCredentialRejectedError';
  }
}

export const isNativeNotificationCredentialRejectedError = (value: unknown) =>
  value instanceof NativeNotificationCredentialRejectedError;

export function createScopedRegistration(
  context: CommunityContext,
  legacy = !baseAppRuntime.streamlined
) {
  const scope = communityStorageKeys(context.community);
  const INSTALLATION_KEY = legacy
    ? LEGACY_INSTALLATION_KEY
    : scope.installation;
  const DEVICE_OPT_OUT_KEY = legacy
    ? 'shadowchat-native-notification-device-opt-out-v2'
    : scope.optOut;
  const INSTALLATION_CREDENTIAL_KEY = legacy
    ? LEGACY_CREDENTIAL_KEY
    : scope.credential;
  const LEGACY_ENROLLMENT_COMPLETE_KEY = legacy
    ? 'shadowchat-native-notification-enrollment-complete-v2'
    : scope.credential + '.legacy-complete';
  const pendingEnrollmentKey = INSTALLATION_CREDENTIAL_KEY + '.pending-enrollment';
  const usesScopedJournal = baseAppRuntime.streamlined && !legacy;
  const readPendingEnrollment = async (): Promise<PendingNativeEnrollment | null> => {
    if (!usesScopedJournal) return null;
    const stored = await SecureStore.getItemAsync(pendingEnrollmentKey);
    if (!stored) return null;
    try {
      const value = JSON.parse(stored) as PendingNativeEnrollment;
      if (
        !UUID_PATTERN.test(value.installationKey ?? '') ||
        !UUID_PATTERN.test(value.userId ?? '') ||
        !INSTALLATION_CREDENTIAL_PATTERN.test(value.credential ?? '') ||
        !INSTALLATION_CREDENTIAL_PATTERN.test(value.verifier ?? '') ||
        typeof value.ticket !== 'string' ||
        value.ticket.length < 16 ||
        value.ticket.length > 4096 ||
        typeof value.requestId !== 'string' ||
        value.requestId.length < 16 ||
        !/^[A-Za-z0-9._:-]+$/.test(value.requestId) ||
        value.requestId.length > 160
      )
        throw new Error();
      return value;
    } catch {
      throw new Error('Previous notification enrollment must be resolved before continuing.');
    }
  };
  const getNativeNotificationInstallationKey = () =>
    withInstallationIdentity(INSTALLATION_KEY, async () => {
      // Read the durable identity instead of retaining a pre-migration UUID in
      // a facade's resolved promise. The shared queue prevents double creation.
      const stored = await SecureStore.getItemAsync(INSTALLATION_KEY);
      if (stored && UUID_PATTERN.test(stored)) {
        await SecureStore.setItemAsync(INSTALLATION_KEY, stored, DEVICE_ONLY_SECURE_STORE_OPTIONS);
        return stored;
      }
      const created = Crypto.randomUUID();
      await SecureStore.setItemAsync(INSTALLATION_KEY, created, DEVICE_ONLY_SECURE_STORE_OPTIONS);
      return created;
    });

  const getNativeNotificationDeviceOptOut = async () =>
    (await SecureStore.getItemAsync(DEVICE_OPT_OUT_KEY)) === 'true';

  const setNativeNotificationDeviceOptOut = async (optedOut: boolean) => {
    if (optedOut) {
      await SecureStore.setItemAsync(DEVICE_OPT_OUT_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(DEVICE_OPT_OUT_KEY);
    }
  };

  const getNativeNotificationInstallationCredential = async () => {
    const stored = await SecureStore.getItemAsync(INSTALLATION_CREDENTIAL_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as Partial<NativeNotificationInstallationCredential>;
      if (
        typeof parsed.installationKey !== 'string' ||
        !UUID_PATTERN.test(parsed.installationKey) ||
        typeof parsed.userId !== 'string' ||
        !UUID_PATTERN.test(parsed.userId) ||
        typeof parsed.credential !== 'string' ||
        !INSTALLATION_CREDENTIAL_PATTERN.test(parsed.credential) ||
        (parsed.enrollmentPending !== undefined && typeof parsed.enrollmentPending !== 'boolean')
      ) {
        throw new Error('Previous notification registration is malformed.');
      }
      const guarded = {
        ...parsed,
        ...((await readPendingEnrollment()) ? { enrollmentPending: true } : {}),
      } as NativeNotificationInstallationCredential;
      rememberInstallation(context.community, guarded);
      return guarded;
    } catch {
      throw new Error('Previous notification registration must be resolved before continuing.');
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
    rememberInstallation(context.community, credential);
    await SecureStore.deleteItemAsync(LEGACY_ENROLLMENT_COMPLETE_KEY);
  };

  const clearNativeNotificationInstallationCredential = async (confirmedRevocation = false) => {
    const previous = await getNativeNotificationInstallationCredential();
    if ((previous?.enrollmentPending || (await readPendingEnrollment())) && !confirmedRevocation)
      throw new Error('Previous notification enrollment must be resolved before continuing.');
    rememberInstallation(context.community, null);
    await Promise.all([
      SecureStore.deleteItemAsync(INSTALLATION_CREDENTIAL_KEY),
      SecureStore.deleteItemAsync(LEGACY_ENROLLMENT_COMPLETE_KEY),
    ]);
  };

  const getEasProjectId = () => {
    const easProjectId = Constants.easConfig?.projectId;
    if (easProjectId) return easProjectId;
    const extra = Constants.expoConfig?.extra as
      | {
          eas?: { projectId?: string };
        }
      | undefined;
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
      operation: () =>
        Notifications.getExpoPushTokenAsync({
          projectId,
          devicePushToken,
        }),
    });
  };

  const getPublicSupabaseConfiguration = () => ({
    supabaseUrl: context.community.supabaseUrl,
    supabaseAnonKey: context.community.publicKey,
  });

  const invokeInstallationCredentialRpc = async <T>(
    functionName: string,
    body: Record<string, unknown>,
    timeoutMs = CREDENTIAL_RPC_TIMEOUT_MS
  ) => {
    if (
      !isCurrentCommunity(context) &&
      functionName !== 'revoke_notification_installation_by_credential_v2' &&
      functionName !== 'revoke_notification_installation_with_proof_v1' &&
      functionName !== 'settle_native_notification_enrollment_attempt_v1'
    )
      throw new Error('This community is no longer active.');
    const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfiguration();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Notification device update failed (${response.status}).`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let settlingEnrollment: Promise<void> | null = null;
  const settleNativeNotificationEnrollmentAttempt = () => {
    if (settlingEnrollment) return settlingEnrollment;
    const operation = (async () => {
      const pending = await readPendingEnrollment();
      if (!pending) return;
      const settled = await invokeInstallationCredentialRpc<boolean>(
        'settle_native_notification_enrollment_attempt_v1',
        {
          target_user_id: pending.userId,
          target_installation_key: pending.installationKey,
          target_ticket: pending.ticket,
          target_request_id: pending.requestId,
          target_verifier: pending.verifier,
          target_credential: pending.credential,
        }
      );
      if (settled !== true)
        throw new Error(
          'Previous notification enrollment could not be resolved. Retry before continuing.'
        );
      const prove = (identity: NativeNotificationInstallationCredential) =>
        invokeInstallationCredentialRpc<boolean>('revoke_notification_installation_with_proof_v1', {
          target_user_id: identity.userId,
          target_installation_key: identity.installationKey,
          target_credential: identity.credential,
        });
      const pendingRevoked = await prove(pending);
      const previous = await getNativeNotificationInstallationCredential();
      if (previous) {
        const covered =
          pendingRevoked === true &&
          previous.installationKey === pending.installationKey &&
          previous.userId === pending.userId;
        if (!covered && (await prove(previous)) !== true)
          throw new Error('Previous notification revocation could not be confirmed.');
        await clearNativeNotificationInstallationCredential(true);
      }
      await SecureStore.deleteItemAsync(pendingEnrollmentKey);
      rememberInstallation(context.community, null);
    })();
    settlingEnrollment = operation.finally(() => {
      settlingEnrollment = null;
    });
    return settlingEnrollment;
  };

  const adoptLegacyMemberInstallationKey = async () => {
    if (!usesScopedJournal || context.community.id !== 'member') return;
    await withInstallationIdentity(INSTALLATION_KEY, async () => {
      // Only startup may call this, after exact legacy credential revocation
      // and before exposing a community that can request enrollment tickets.
      if (await SecureStore.getItemAsync(LEGACY_CREDENTIAL_KEY))
        throw new Error('Previous notification registration must be revoked before continuing.');
      await settleNativeNotificationEnrollmentAttempt();
      // A confirmed scoped registration already owns its identity. Never move
      // it merely because this device still retains a historical legacy key.
      if (await getNativeNotificationInstallationCredential()) return;
      const preserved = await SecureStore.getItemAsync(LEGACY_INSTALLATION_KEY);
      if (!preserved) return;
      if (!UUID_PATTERN.test(preserved))
        throw new Error('Previous notification installation identifier is invalid.');
      await SecureStore.setItemAsync(INSTALLATION_KEY, preserved, DEVICE_ONLY_SECURE_STORE_OPTIONS);
      // Deliberately retain the original key. No credentials, user IDs, tokens
      // or opt-out state cross namespaces; fresh enrollment still authenticates.
    });
  };

  const wait = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    if (!isCurrentCommunity(context)) throw new Error('This community is no longer active.');
    const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfiguration();

    const scoped =
      baseAppRuntime.streamlined &&
      /^\d+$/.test(Application.nativeBuildVersion ?? '') &&
      Number(Application.nativeBuildVersion) >= 22;
    if (baseAppRuntime.streamlined && !scoped)
      throw new Error('This app must be updated before enabling community notifications.');
    const enrollmentRpc = scoped
      ? 'redeem_scoped_native_notification_enrollment_ticket_v2'
      : 'redeem_native_notification_enrollment_ticket_v2';
    if (scoped) {
      await settleNativeNotificationEnrollmentAttempt();
      await SecureStore.setItemAsync(
        pendingEnrollmentKey,
        JSON.stringify({
          installationKey,
          userId: enrollmentUserId,
          credential: installationCredential,
          ticket,
          requestId,
          verifier,
        } satisfies PendingNativeEnrollment),
        DEVICE_ONLY_SECURE_STORE_OPTIONS
      );
      const previous = await getNativeNotificationInstallationCredential();
      rememberInstallation(context.community, previous);
    }
    let response: Response;
    let payload: {
      message?: unknown;
      user_id?: unknown;
      installation_id?: unknown;
      community_scope_version?: unknown;
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/rpc/${enrollmentRpc}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          ...(scoped ? { target_community_scope_version: 1 } : {}),
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
      });
      payload = await response.json();
    } catch (caught) {
      if (scoped)
        throw new Error(
          'Notification enrollment could not be confirmed. Retry setup before continuing.'
        );
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
      if (typeof payload?.message === 'string' && payload.message.length <= 240)
        message = payload.message;
      throw new Error(message);
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.user_id !== 'string' ||
      !UUID_PATTERN.test(payload.user_id) ||
      payload.user_id !== enrollmentUserId ||
      typeof payload.installation_id !== 'string' ||
      !UUID_PATTERN.test(payload.installation_id) ||
      (scoped && payload.community_scope_version !== 1)
    ) {
      throw new Error('Notification enrollment returned an invalid device credential.');
    }
    await setNativeNotificationInstallationCredential({
      installationKey,
      userId: payload.user_id,
      credential: installationCredential,
    });
    if (scoped) await SecureStore.deleteItemAsync(pendingEnrollmentKey);
  };

  const refreshNativeNotificationToken = async (devicePushToken: Notifications.DevicePushToken) => {
    if (await getNativeNotificationDeviceOptOut()) return;
    const installation = await getNativeNotificationInstallationCredential();
    if (!installation) return;
    if (installation.enrollmentPending)
      throw new Error('Previous notification enrollment must be confirmed before continuing.');
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

  const reconcileNativeNotificationInstallation = async () => {
    if (await getNativeNotificationDeviceOptOut()) return false;
    if (!(await getNativeNotificationInstallationCredential())) return false;
    const devicePushToken = await getFreshDevicePushTokenAsync();
    return refreshNativeNotificationToken(devicePushToken);
  };

  const registerNativeNotificationInstallation = async ({
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
    const permissions =
      requestPermission && currentPermissions.status !== 'granted'
        ? await runNotificationStage({
            stage: 'requesting_permission',
            operation: Notifications.requestPermissionsAsync,
          })
        : currentPermissions;
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
    await redeemNativeNotificationEnrollmentTicket({
      ticket: enrollmentTicket,
      requestId,
      installationKey,
      verifier: enrollmentVerifier,
      installationCredential,
      enrollmentUserId,
      expoPushToken: expoPushToken.data,
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
        target_foreground_until: foreground ? new Date(Date.now() + 90_000).toISOString() : null,
      }
    );
    if (updated !== true) {
      throw new NativeNotificationCredentialRejectedError();
    }
    return true;
  };

  const updateNativeNotificationForegroundLease = (foreground: boolean) => {
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

  const revokeNativeNotificationInstallation = async () => {
    await settleNativeNotificationEnrollmentAttempt();
    const installation = await getNativeNotificationInstallationCredential();
    if (!installation) {
      await clearNativeNotificationInstallationCredential();
      return true;
    }
    const revoked = await invokeInstallationCredentialRpc<boolean>(
      baseAppRuntime.streamlined
        ? 'revoke_notification_installation_with_proof_v1'
        : 'revoke_notification_installation_by_credential_v2',
      {
        ...(baseAppRuntime.streamlined ? { target_user_id: installation.userId } : {}),
        target_installation_key: installation.installationKey,
        target_credential: installation.credential,
      }
    );
    if (revoked !== true)
      throw new Error('Previous notification revocation could not be confirmed.');
    await clearNativeNotificationInstallationCredential(true);
    return true;
  };

  return {
    getNativeNotificationInstallationKey,
    adoptLegacyMemberInstallationKey,
    settleNativeNotificationEnrollmentAttempt,
    getNativeNotificationDeviceOptOut,
    setNativeNotificationDeviceOptOut,
    getNativeNotificationInstallationCredential,
    clearNativeNotificationInstallationCredential,
    refreshNativeNotificationToken,
    reconcileNativeNotificationInstallation,
    registerNativeNotificationInstallation,
    updateNativeNotificationForegroundLease,
    revokeNativeNotificationInstallation,
  };
}

const registrations = new WeakMap<CommunityContext, ReturnType<typeof createScopedRegistration>>();
const registrationFor = (context: CommunityContext) => {
  let value = registrations.get(context);
  if (!value) {
    value = createScopedRegistration(context);
    registrations.set(context, value);
  }
  return value;
};
export const bindCommunityRegistration = (context: CommunityContext) => {
  const registration = registrationFor(context);
  return Object.fromEntries(
    Object.entries(registration).map(([key, method]) => [
      key,
      (...args: unknown[]) =>
        runCommunityOperation(context, () =>
          (method as (...values: unknown[]) => Promise<unknown>)(...args)
        ),
    ])
  ) as ReturnType<typeof createScopedRegistration>;
};
export const getNativeNotificationInstallationKey = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['getNativeNotificationInstallationKey']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).getNativeNotificationInstallationKey(...args)
  );
};
export const getNativeNotificationDeviceOptOut = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['getNativeNotificationDeviceOptOut']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).getNativeNotificationDeviceOptOut(...args)
  );
};
export const setNativeNotificationDeviceOptOut = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['setNativeNotificationDeviceOptOut']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).setNativeNotificationDeviceOptOut(...args)
  );
};
export const getNativeNotificationInstallationCredential = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['getNativeNotificationInstallationCredential']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).getNativeNotificationInstallationCredential(...args)
  );
};
export const clearNativeNotificationInstallationCredential = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['clearNativeNotificationInstallationCredential']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).clearNativeNotificationInstallationCredential(...args)
  );
};
export const refreshNativeNotificationToken = (
  ...args: Parameters<ReturnType<typeof createScopedRegistration>['refreshNativeNotificationToken']>
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).refreshNativeNotificationToken(...args)
  );
};
export const reconcileNativeNotificationInstallation = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['reconcileNativeNotificationInstallation']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).reconcileNativeNotificationInstallation(...args)
  );
};
export const registerNativeNotificationInstallation = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['registerNativeNotificationInstallation']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).registerNativeNotificationInstallation(...args)
  );
};
export const updateNativeNotificationForegroundLease = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['updateNativeNotificationForegroundLease']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).updateNativeNotificationForegroundLease(...args)
  );
};
export const revokeNativeNotificationInstallation = (
  ...args: Parameters<
    ReturnType<typeof createScopedRegistration>['revokeNativeNotificationInstallation']
  >
) => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).revokeNativeNotificationInstallation(...args)
  );
};

export const settleNativeNotificationEnrollmentAttempt = () => {
  const context = requireCommunity();
  return runCommunityOperation(context, () =>
    registrationFor(context).settleNativeNotificationEnrollmentAttempt()
  );
};
