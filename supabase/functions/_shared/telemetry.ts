import * as Sentry from 'npm:@sentry/deno@10.64.0'

let initialized = false

export const initializeEdgeTelemetry = (functionName: string) => {
  const dsn = Deno.env.get('SENTRY_DSN')?.trim()
  if (!dsn || initialized) return Boolean(dsn)
  Sentry.init({
    dsn,
    environment: Deno.env.get('APP_ENVIRONMENT') || 'production',
    release: Deno.env.get('DENO_DEPLOYMENT_ID') || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    initialScope: { tags: { function: functionName } },
    beforeSend(event) {
      // Edge events are intentionally metadata-only. Never attach Request,
      // Response, Supabase error objects, bodies, headers, or user identity.
      event.request = undefined
      event.user = undefined
      event.breadcrumbs = undefined
      event.extra = undefined
      event.contexts = undefined
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map(value => ({ type: value.type || 'EdgeError' }))
      }
      return event
    },
  })
  initialized = true
  return true
}

export const captureEdgeException = (error: unknown, operation: string) => {
  if (!initialized) return
  Sentry.withScope(scope => {
    scope.setTag('operation', operation)
    Sentry.captureException(error instanceof Error ? new Error(error.name) : new Error('Unknown edge error'))
  })
}
