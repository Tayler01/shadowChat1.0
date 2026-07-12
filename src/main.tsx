import { StrictMode } from 'react';
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
import { ModerationReportProvider } from './features/moderation/ModerationReportProvider';
import { ComfortPreferencesProvider } from './hooks/useComfortPreferences';

initializeTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BlockedUsersProvider>
        <PresenceRoot>
          <ComfortPreferencesProvider>
            <ThemeProvider>
              <ModerationReportProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </ModerationReportProvider>
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
