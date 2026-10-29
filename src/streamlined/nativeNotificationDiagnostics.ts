export const statuses = {
  reading: 'Checking unread count',
  read_failed: 'Unread count request failed',
  auth_failed: 'Native sign-in needs refreshing',
  applying: 'Updating app icon',
  write_failed: 'App icon update failed',
  verified: 'App icon count verified',
  mismatch: 'App icon count differs',
} as const
export type Diagnostic = { status: keyof typeof statuses; expected: number | null; observed: number | null; at: number }
export function parseBadgeDiagnostics(value: unknown): Diagnostic | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.status !== 'string' || !Object.prototype.hasOwnProperty.call(statuses, record.status)) return null
  const count = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 99)
  if (!count(record.expected) || !count(record.observed) || typeof record.at !== 'number' || !Number.isFinite(record.at) || record.at <= 0) return null
  return { status: record.status as Diagnostic['status'], expected: record.expected as number | null, observed: record.observed as number | null, at: record.at }
}

export const routeStatuses = {
  received: 'Notification tap received',
  waiting_for_session: 'Waiting for native sign-in',
  scope_rejected: 'Notification belongs to another sign-in or community',
  envelope_rejected: 'Notification destination could not be read',
  route_requested: 'Notification destination requested',
} as const
export type RouteDiagnostic = { status: keyof typeof routeStatuses; source: 'expo' | 'notifee'; at: number }
export function parseRouteDiagnostics(value: unknown): RouteDiagnostic | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.status !== 'string' || !Object.prototype.hasOwnProperty.call(routeStatuses, record.status) || (record.source !== 'expo' && record.source !== 'notifee')) return null
  if (typeof record.at !== 'number' || !Number.isFinite(record.at) || record.at <= 0) return null
  return { status: record.status as RouteDiagnostic['status'], source: record.source as RouteDiagnostic['source'], at: record.at }
}
