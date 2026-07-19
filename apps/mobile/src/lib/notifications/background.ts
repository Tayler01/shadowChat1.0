import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { displayAndroidNotificationEnvelope } from './androidPresenter';
import { parseNotificationEnvelopeV2 } from '@/types/notification-envelope-v2';

export const NATIVE_NOTIFICATION_TASK =
  'shadowchat-native-notification-background-v2';

export const presentationFromTaskPayload = (payload: unknown) => {
  const record = (
    payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {}
  );
  const notification = (
    record.notification && typeof record.notification === 'object'
      ? record.notification as Record<string, unknown>
      : record
  );
  const request = (
    notification.request && typeof notification.request === 'object'
      ? notification.request as Record<string, unknown>
      : {}
  );
  const content = (
    request.content && typeof request.content === 'object'
      ? request.content as Record<string, unknown>
      : {}
  );
  const data = (
    content.data && typeof content.data === 'object'
      ? content.data as Record<string, unknown>
      : record.data && typeof record.data === 'object'
        ? record.data as Record<string, unknown>
        : record
  );
  let decodedData = data;
  if (typeof data.dataString === 'string') {
    try {
      const parsed = JSON.parse(data.dataString);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        decodedData = parsed as Record<string, unknown>;
      }
    } catch {
      return { envelope: null, badgeCount: 0 };
    }
  }
  const envelope = parseNotificationEnvelopeV2(
    decodedData.envelopeV2 ??
    decodedData.notificationEnvelopeV2 ??
    decodedData
  );
  const badge = Number(decodedData.badgeCount ?? 0);
  return {
    envelope,
    badgeCount: Number.isFinite(badge)
      ? Math.max(0, Math.min(99, Math.floor(badge)))
      : 0,
  };
};

export const registerNativeNotificationBackgroundTask = async () => {
  if (Platform.OS !== 'android') return;
  if (await TaskManager.isTaskRegisteredAsync(NATIVE_NOTIFICATION_TASK)) return;
  await Notifications.registerTaskAsync(NATIVE_NOTIFICATION_TASK);
};

if (Platform.OS === 'android') {
  if (!TaskManager.isTaskDefined(NATIVE_NOTIFICATION_TASK)) {
    TaskManager.defineTask(NATIVE_NOTIFICATION_TASK, async ({ data }) => {
      if (AppState.currentState === 'active') return;
      const presentation = presentationFromTaskPayload(data);
      if (presentation.envelope) {
        await displayAndroidNotificationEnvelope(
          presentation.envelope,
          presentation.badgeCount
        );
      }
    });
  }
  void registerNativeNotificationBackgroundTask()
    .catch(() => undefined);

}
