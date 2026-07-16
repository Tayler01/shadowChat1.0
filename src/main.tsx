import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { PresenceRoot } from './PresenceRoot';
import { registerPushServiceWorker } from './lib/push';
import { initializeTelemetry } from './lib/telemetry';
import { BlockedUsersProvider } from './hooks/useBlockedUsers';
import { ComfortPreferencesProvider } from './hooks/useComfortPreferences';
import { MEMBER_REPORTING_FEATURE_ENABLED, SHADO_LIVE_REAL_ENABLED } from './config/featureFlags';

const REPORTING_RUNTIME_ENABLED = MEMBER_REPORTING_FEATURE_ENABLED || SHADO_LIVE_REAL_ENABLED;

const ModerationReportProvider = REPORTING_RUNTIME_ENABLED
  ? lazy(() => import('./features/moderation/ModerationReportProvider').then(module => ({
      default: module.ModerationReportProvider,
    })))
  : null;

initializeTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BlockedUsersProvider>
        <PresenceRoot>
          <ComfortPreferencesProvider>
            <ThemeProvider>
              {REPORTING_RUNTIME_ENABLED && ModerationReportProvider ? (
                <Suspense fallback={null}>
                  <ModerationReportProvider>
                    <ErrorBoundary>
                      <App />
                    </ErrorBoundary>
                  </ModerationReportProvider>
                </Suspense>
              ) : (
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              )}
            </ThemeProvider>
          </ComfortPreferencesProvider>
        </PresenceRoot>
      </BlockedUsersProvider>
    </AuthProvider>
  </StrictMode>
);

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    registerPushServiceWorker().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('Push service worker registration skipped:', error);
      }
    });
  });
}
