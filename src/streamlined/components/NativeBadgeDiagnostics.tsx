import { useEffect, useState } from 'react'
import { NATIVE_APP_MESSAGE_EVENT, requestNativeNotificationState } from '../../lib/nativeAppBridge'

import { statuses, parseBadgeDiagnostics, type Diagnostic, routeStatuses, parseRouteDiagnostics, type RouteDiagnostic } from '../nativeNotificationDiagnostics'

export function NativeBadgeDiagnostics() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [route, setRoute] = useState<RouteDiagnostic | null>(null)
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.version !== 1 || detail?.type !== 'notifications_state') return
      setDiagnostic(parseBadgeDiagnostics(detail.badgeDiagnostics))
      setRoute(parseRouteDiagnostics(detail.routeDiagnostics))
    }
    window.addEventListener(NATIVE_APP_MESSAGE_EVENT, receive)
    requestNativeNotificationState()
    return () => window.removeEventListener(NATIVE_APP_MESSAGE_EVENT, receive)
  }, [])
  return <details className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
    <summary className="min-h-12 cursor-pointer py-3">Notification status</summary>
    {diagnostic ? <p>{statuses[diagnostic.status]} · unread {diagnostic.expected ?? 'not checked'} · device {diagnostic.observed ?? 'not checked'} · {new Date(diagnostic.at).toLocaleTimeString()}</p> : <p>Waiting for a native badge check.</p>}
    {route && <p>{routeStatuses[route.status]} · {route.source} · {new Date(route.at).toLocaleTimeString()}</p>}
  </details>
}
