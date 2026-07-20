import type { NativeNotificationStage } from '../nativeAppBridge';

export const NATIVE_NOTIFICATION_STAGE_TIMEOUT_MS: Partial<
  Record<NativeNotificationStage, number>
> = {
  syncing_session: 15_000,
  reading_permission: 8_000,
  requesting_permission: 45_000,
  registering_installation: 15_000,
  requesting_device_token: 20_000,
  requesting_expo_token: 20_000,
  registering_token: 15_000,
};

const stageLabels: Partial<Record<NativeNotificationStage, string>> = {
  syncing_session: 'securing your ShadoChat session',
  reading_permission: 'checking notification permission',
  requesting_permission: 'waiting for iPhone notification permission',
  registering_installation: 'registering this device',
  requesting_device_token: 'connecting to Apple Push Notification service',
  requesting_expo_token: 'creating the ShadoChat push token',
  registering_token: 'saving the ShadoChat push token',
};

export class NativeNotificationStageTimeoutError extends Error {
  readonly stage: NativeNotificationStage;

  constructor(stage: NativeNotificationStage) {
    super(
      `Notification setup timed out while ${
        stageLabels[stage] ?? 'finishing this step'
      }. Check your connection and try again.`
    );
    this.name = 'NativeNotificationStageTimeoutError';
    this.stage = stage;
  }
}

export const runNotificationStage = async <T>({
  stage,
  operation,
  timeoutMs = NATIVE_NOTIFICATION_STAGE_TIMEOUT_MS[stage] ?? 15_000,
}: {
  stage: NativeNotificationStage;
  operation: () => Promise<T>;
  timeoutMs?: number;
}) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new NativeNotificationStageTimeoutError(stage)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};
