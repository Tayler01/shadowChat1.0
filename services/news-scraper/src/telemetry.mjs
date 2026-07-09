import * as Sentry from '@sentry/node'

const sensitive = /authorization|cookie|token|password|secret|session|message|content|body|email|username|handle|device|auth.*state/i

export const scrubWorkerEvent = (value, key = '', depth = 0) => {
  if (depth > 5 || sensitive.test(key)) return '[redacted]'
  if (typeof value === 'string') return value.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 500)
  if (Array.isArray(value)) return value.slice(0, 25).map(item => scrubWorkerEvent(item, key, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [childKey, scrubWorkerEvent(childValue, childKey, depth + 1)]))
  }
  return value
}

export const initializeWorkerTelemetry = () => {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return false
  Sentry.init({
    dsn,
    environment: process.env.APP_ENVIRONMENT || 'production',
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: event => scrubWorkerEvent(event),
  })
  return true
}

export const captureWorkerException = (error, operation) => {
  if (!process.env.SENTRY_DSN?.trim()) return
  Sentry.withScope(scope => {
    scope.setTag('operation', operation)
    Sentry.captureException(error instanceof Error ? new Error(error.name) : new Error('Unknown worker error'))
  })
}
