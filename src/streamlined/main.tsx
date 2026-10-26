import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../../apps/streamlined/src-overrides/hooks/useAuth'
import { BlockedUsersProvider } from '../hooks/useBlockedUsers'
import { ComfortPreferencesProvider } from '../hooks/useComfortPreferences'
import { ThemeProvider } from './StreamlinedTheme'
import { PresenceRoot } from '../PresenceRoot'
import { NativeAppBridge } from '../components/native/NativeAppBridge'
import { ModerationReportProvider } from '../features/moderation/ModerationReportProvider'
import ErrorBoundary from '../components/ErrorBoundary'
import { registerPushServiceWorker } from '../lib/push'
import { isNativeAppWebView } from '../lib/nativeAppBridge'
import StreamlinedApp from './StreamlinedApp'
import '../index.css'
import './streamlined.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <NativeAppBridge />
      <BlockedUsersProvider>
        <PresenceRoot>
          <ComfortPreferencesProvider>
            <ThemeProvider>
              <ModerationReportProvider>
                <ErrorBoundary><StreamlinedApp /></ErrorBoundary>
              </ModerationReportProvider>
            </ThemeProvider>
          </ComfortPreferencesProvider>
        </PresenceRoot>
      </BlockedUsersProvider>
    </AuthProvider>
  </StrictMode>,
)

window.addEventListener('load', () => {
  if (!isNativeAppWebView()) void registerPushServiceWorker().catch(() => undefined)
})
