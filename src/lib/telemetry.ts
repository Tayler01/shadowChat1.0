import * as Sentry from '@sentry/react';
import { VITE_APP_BUILD_ID, VITE_APP_COMMIT_SHA, VITE_APP_DEPLOY_CONTEXT, VITE_APP_MODE, VITE_SENTRY_DSN } from './env';

const REDACTED = '[redacted]';
const sensitiveKey = /authorization|cookie|token|password|secret|session|message|content|body|prompt|email|username|device|pairing|recovery/i;
const credentialValue = /(bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|[?&#](?:access_token|token|code)=)/i;

export const scrubTelemetryValue = (value: unknown, key = '', depth = 0): unknown => {
  if (depth > 5 || sensitiveKey.test(key)) return REDACTED;
  if (typeof value === 'string') {
    if (credentialValue.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return REDACTED;
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.slice(0, 500);
    }
  }
  if (Array.isArray(value)) return value.slice(0, 25).map(item => scrubTelemetryValue(item, key, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [
      childKey,
      scrubTelemetryValue(childValue, childKey, depth + 1),
    ]));
  }
  return value;
};

export const initializeTelemetry = () => {
  const dsn = VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: VITE_APP_DEPLOY_CONTEXT || VITE_APP_MODE,
    release: VITE_APP_COMMIT_SHA || VITE_APP_BUILD_ID || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend(event) {
      return scrubTelemetryValue(event) as typeof event;
    },
  });
};

export const captureFrontendException = (error: unknown, operation: string) => {
  if (!VITE_SENTRY_DSN?.trim()) return;
  Sentry.withScope(scope => {
    scope.setTag('operation', operation);
    Sentry.captureException(error instanceof Error ? new Error(error.name) : new Error('Unknown frontend error'));
  });
};
