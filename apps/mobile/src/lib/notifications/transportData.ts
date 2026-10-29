const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const decode = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') return record(value);
  if (value.length > 32_768) return null;
  try { return record(JSON.parse(value)); } catch { return null; }
};

/** Expo JS exposes its data directly; Notifee iOS preserves APNs userInfo.body.
 * Android local Notifee notifications serialize envelopeV2 instead. Select one
 * complete transport container before checking BOTH its scope and envelope.
 * Never combine outer authorization metadata with a nested payload.
 */
export function readNativeNotificationData(value: unknown): Record<string, unknown> | null {
  const outer = record(value);
  if (!outer) return null;
  if ('envelopeV2' in outer || 'notificationEnvelopeV2' in outer) return outer;
  if ('body' in outer) return decode(outer.body);
  if ('dataString' in outer) return decode(outer.dataString);
  return outer;
}

export function readNativeNotificationEnvelope(data: Record<string, unknown> | null): unknown {
  if (!data) return null;
  const envelope = data.envelopeV2 ?? data.notificationEnvelopeV2 ?? data;
  return typeof envelope === 'string' ? decode(envelope) : envelope;
}

export type RouteDiagnostics = {
  source: 'expo' | 'notifee';
  status: 'received' | 'waiting_for_session' | 'scope_rejected' | 'envelope_rejected' | 'route_requested';
  at: number;
};
