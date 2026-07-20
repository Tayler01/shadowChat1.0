export type NativeNotificationStage =
  | 'idle'
  | 'syncing_session'
  | 'reading_permission'
  | 'requesting_permission'
  | 'registering_installation'
  | 'requesting_device_token'
  | 'requesting_expo_token'
  | 'registering_token'
  | 'ready'
  | 'failed';
