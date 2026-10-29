import { lazy, Suspense, useCallback, useEffect, useState, useTransition } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from '../../apps/streamlined/src-overrides/components/auth/AuthGuard'
import { SoundEffectsProvider } from '../hooks/useSoundEffects'
import { ClientResetProvider } from '../hooks/ClientResetContext'
import { MessagesProvider } from '../../apps/streamlined/src-overrides/hooks/useMessages'
import { DirectMessagesProvider } from '../../apps/streamlined/src-overrides/hooks/useDirectMessages'
import { HypeProvider } from '../hooks/useHype'
import { NotificationCoordinatorProvider } from '../../apps/streamlined/src-overrides/features/notifications/NotificationCoordinator'
import { HypeCelebrationController } from '../components/hype/HypeCelebrationController'
import { PushSubscriptionSync } from '../components/notifications/PushSubscriptionSync'
import { useSessionResumeRecovery } from '../hooks/useSessionResumeRecovery'
import { useChannelBanExpirySweep } from '../hooks/useChannelBanExpirySweep'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useStreamlinedViewport } from './useStreamlinedViewport'
import { MobileNav } from './components/StreamlinedMobileNav'
import { StreamlinedLoadingView } from './components/StreamlinedLoadingView'
import { normalizeStreamlinedUrl, readStreamlinedLocation, streamlinedSearchUrl, streamlinedViewUrl } from './routing'
import {
  resolveChatThreadRouteMutation, resolveDMRouteMutation, resolvePinRouteMutation,
  resolvePinFeedModeMutation, resolvePinCircleFilterMutation, resolveInnerCircleRouteMutation,
  type ChatThreadRouteAction, type DMRouteAction, type PinRouteAction, type PinFeedMode,
  type InnerCircleRouteAction, type DMHistoryLayer, type PinHistoryLayer, type InnerCircleHistoryLayer,
} from '../lib/appRouting'
import { markNotificationEventRead, clearNotificationEventFromSystemTray } from '../features/notifications/notificationApi'
import { requestAppBadgeRefresh } from '../lib/appBadge'
import type { AppView } from '../types/navigation'

const ChatView = lazy(() => import('../../apps/streamlined/src-overrides/components/chat/ChatView').then(m => ({ default: m.ChatView })))
const DirectMessagesView = lazy(() => import('../../apps/streamlined/src-overrides/components/dms/DirectMessagesView').then(m => ({ default: m.DirectMessagesView })))
const ShadowPin = lazy(() => import('../../apps/streamlined/src-overrides/features/shadow-pin/ShadowPin').then(m => ({ default: m.ShadowPin })))
const Settings = lazy(() => import('./StreamlinedSettings').then(m => ({ default: m.StreamlinedSettings })))
const AccountSettings = lazy(() => import('./StreamlinedSettings').then(m => ({ default: m.StreamlinedAccountSettings })))
const Policies = lazy(() => import('./StreamlinedPolicies').then(m => ({ default: m.StreamlinedPolicies })))
const MembershipGate = lazy(() => import('./StreamlinedMembershipGate').then(m => ({ default: m.StreamlinedMembershipGate })))
const ActiveUsersView = lazy(() => import('../components/chat/ActiveUsersView').then(m => ({ default: m.ActiveUsersView })))
const Search = lazy(() => import('../../apps/streamlined/src-overrides/features/discovery/UniversalDiscoveryDialog').then(m => ({ default: m.UniversalDiscoveryView })))

type Mutation = { method: 'back' | 'back-two' } | { method: 'push' | 'replace'; url: URL; layer?: string | null } | null
const desktopTabs = [{ view: 'chat', label: 'Group chat' }, { view: 'dms', label: 'Direct messages' }, { view: 'active-users', label: 'Active users' }, { view: 'pins', label: 'ShadowPin' }, { view: 'settings', label: 'Settings' }] as const
const readLocation = () => readStreamlinedLocation(new URL(window.location.href))

function LoadingView({ fullscreen = false }: { fullscreen?: boolean }) {
  return <StreamlinedLoadingView fullscreen={fullscreen} />
}

function StreamlinedShell() {
  const [route, setRoute] = useState(readLocation)
  const [tabPending, startTabTransition] = useTransition()
  const isDesktop = useIsDesktop()
  useStreamlinedViewport(isDesktop)
  useSessionResumeRecovery()
  useChannelBanExpirySweep()

  const applyMutation = useCallback((mutation: Mutation) => {
    if (!mutation) return
    if (mutation.method === 'back' || mutation.method === 'back-two') {
      window.history.go(mutation.method === 'back-two' ? -2 : -1)
      return
    }
    if (!('url' in mutation)) return
    const url = normalizeStreamlinedUrl(mutation.url)
    const state = { ...window.history.state, shadowchatLayer: mutation.layer ?? null }
    if (mutation.method === 'push') window.history.pushState(state, '', url)
    else window.history.replaceState(state, '', url)
    setRoute(readStreamlinedLocation(url))
  }, [])

  useEffect(() => {
    const sync = () => {
      const url = normalizeStreamlinedUrl(new URL(window.location.href))
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
      setRoute(readStreamlinedLocation(url))
    }
    const markRead = (ids: string[]) => {
      void Promise.allSettled(ids.slice(0, 32).map(async eventId => {
        await markNotificationEventRead(eventId)
        await clearNotificationEventFromSystemTray({ eventId })
      })).finally(() => requestAppBadgeRefresh())
    }
    const onNotification = (event: MessageEvent) => {
      if (event.data?.type !== 'SHADOWCHAT_NOTIFICATION_CLICK') return
      const target = event.data.targetHref || event.data.targetUrl || event.data.data?.route || event.data.data?.url
      if (typeof target !== 'string') return
      let url: URL
      try { url = new URL(target, window.location.origin) } catch { return }
      if (url.origin !== window.location.origin) return
      if (event.data.action === 'mark_read') {
        const ids = Array.isArray(event.data.eventIds) ? event.data.eventIds : [event.data.eventId]
        markRead(ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))
      }
      applyMutation({ method: 'replace', url })
    }
    const url = new URL(window.location.href)
    if (url.searchParams.get('notificationAction') === 'mark_read') {
      markRead((url.searchParams.get('notificationEvents') ?? '').split(',').map(v => v.trim()).filter(Boolean))
      url.searchParams.delete('notificationAction')
      url.searchParams.delete('notificationEvents')
      window.history.replaceState(window.history.state, '', url)
    }
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('pageshow', sync)
    navigator.serviceWorker?.addEventListener('message', onNotification)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('pageshow', sync)
      navigator.serviceWorker?.removeEventListener('message', onNotification)
    }
  }, [applyMutation])

  const navigate = useCallback((view: AppView) => {
    // Only ordinary tab navigation retains the current surface while a lazy
    // module loads. Auth, sign-out and community boundaries remain immediate.
    startTabTransition(() => applyMutation({ method: 'push', url: streamlinedViewUrl(new URL(window.location.href), view) }))
  }, [applyMutation, startTabTransition])
  const search = useCallback((query: string, scope: 'messages' | 'all') => {
    applyMutation({ method: 'push', url: streamlinedSearchUrl(new URL(window.location.href), query, scope) })
  }, [applyMutation])
  const routeChat = useCallback((action: ChatThreadRouteAction, threadRootId?: string, targetMessageId?: string) => {
    applyMutation(resolveChatThreadRouteMutation({ currentUrl: new URL(window.location.href), currentLayer: window.history.state?.shadowchatLayer === 'chat-thread' ? 'chat-thread' : null, action, threadRootId, targetMessageId }))
  }, [applyMutation])
  const routeDM = useCallback((action: DMRouteAction, conversationId?: string, messageId?: string) => {
    applyMutation(resolveDMRouteMutation({ currentUrl: new URL(window.location.href), currentLayer: window.history.state?.shadowchatLayer as DMHistoryLayer ?? null, action, conversationId, messageId }))
  }, [applyMutation])
  const routePin = useCallback((action: PinRouteAction, imageId?: string, commentId?: string) => {
    applyMutation(resolvePinRouteMutation({ currentUrl: new URL(window.location.href), currentLayer: window.history.state?.shadowchatLayer as PinHistoryLayer ?? null, action, imageId, commentId }))
  }, [applyMutation])
  const routeCircles = useCallback((action: InnerCircleRouteAction, circleId?: string) => {
    applyMutation(resolveInnerCircleRouteMutation({ currentUrl: new URL(window.location.href), currentLayer: window.history.state?.shadowchatLayer as InnerCircleHistoryLayer | DMHistoryLayer ?? null, action, circleId }))
  }, [applyMutation])
  const changeFeed = useCallback((mode: PinFeedMode) => {
    applyMutation(resolvePinFeedModeMutation({ currentUrl: new URL(window.location.href), mode }))
  }, [applyMutation])
  const changeCircle = useCallback((circleId: string | null) => {
    applyMutation(resolvePinCircleFilterMutation({ currentUrl: new URL(window.location.href), circleId }))
  }, [applyMutation])

  return <>
    <PushSubscriptionSync />
    <HypeCelebrationController />
    <div className="app-viewport streamlined-shell flex flex-col overflow-hidden md:flex-row">
      <aside className="streamlined-desktop-nav" aria-label="Streamlined navigation">
        <div className="px-3"><p className="font-semibold text-[var(--text-primary)]">ShadowChat</p><p className="text-xs text-[var(--text-muted)]">Streamlined</p></div>
        <nav>{desktopTabs.map(tab => <button key={tab.view} type="button" aria-current={route.view === tab.view ? 'page' : undefined} onClick={() => navigate(tab.view)}>{tab.label}</button>)}</nav>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {tabPending && <div className="streamlined-tab-loading" role="status" aria-live="polite"><div className="streamlined-loading__track" role="progressbar" aria-label="Opening tab" aria-valuetext="Loading"><span className="streamlined-loading__fill" /></div><span>Opening tab...</span></div>}
        <Suspense fallback={<LoadingView />}>
          {route.view === 'chat' && <ChatView currentView="chat" onViewChange={navigate} onSearch={search} initialMessageId={route.message ?? undefined} initialThreadId={route.thread ?? undefined} onThreadRoute={routeChat} />}
          {route.view === 'dms' && <DirectMessagesView currentView="dms" onViewChange={navigate} onToggleSidebar={() => navigate('chat')} initialConversation={route.conversation ?? undefined} initialMessageId={route.message ?? undefined} initialPanel={route.dmPanel} initialConnectionsSection={route.dmConnectionsSection} initialCircleId={route.dmCircle ?? undefined} onRoute={routeDM} onConnectionsRoute={routeCircles} />}
          {route.view === 'pins' && <ShadowPin currentView="pins" onViewChange={navigate} initialImageId={route.pin ?? undefined} initialCommentId={route.comment ?? undefined} initialPanel={route.pinPanel ?? undefined} initialFeedMode={route.pinFeed ?? undefined} initialCircleId={route.pinCircle ?? undefined} onPinRoute={routePin} onFeedModeChange={changeFeed} onCircleChange={changeCircle} />}
          {route.view === 'settings' && <Settings currentView="settings" onViewChange={navigate} fullAppUrl="https://shadochat.online" privacyUrl={import.meta.env.VITE_PRIVACY_POLICY_URL} termsUrl={import.meta.env.VITE_TERMS_URL} />}
          {route.view === 'active-users' && <ActiveUsersView currentView="active-users" onViewChange={navigate} />}
          {route.view === 'discover' && <Search currentView="discover" onViewChange={navigate} />}
        </Suspense>
      </main>
      {route.view !== 'chat' && route.view !== 'dms' && <MobileNav currentView={route.view} onViewChange={navigate} />}
    </div>
  </>
}

export default function StreamlinedApp() {
  const params = new URLSearchParams(window.location.search)
  const legal = params.get('legal')
  if (legal === 'privacy' || legal === 'terms' || legal === 'safety' || legal === 'delete-account') {
    return <Suspense fallback={<LoadingView fullscreen />}><Policies page={legal} supportEmail={import.meta.env.VITE_SUPPORT_EMAIL || 'support@shadochat.online'} privacyEmail={import.meta.env.VITE_PRIVACY_EMAIL || 'privacy@shadochat.online'} operatorName={import.meta.env.VITE_OPERATOR_NAME} /></Suspense>
  }
  // Pending/failed acknowledgement must not obstruct account deletion. An
  // accepted member instead receives the normal account view and navigation.
  const accountOnly = params.get('view') === 'settings' && params.get('settingsSection') === 'account'
  return <SoundEffectsProvider>
    <AuthGuard>
      <Suspense fallback={<LoadingView fullscreen />}>
      <MembershipGate unacceptedContent={accountOnly ? <div className="app-viewport overflow-y-auto p-4"><div className="mx-auto max-w-3xl space-y-4"><a className="inline-flex min-h-11 items-center text-[var(--text-gold)]" href="/">Back to ShadowChat</a><h1 className="text-xl font-semibold">Account</h1><AccountSettings allowProfileEditing={false} /></div></div> : undefined}>
      <NotificationCoordinatorProvider>
        <ClientResetProvider>
          <MessagesProvider>
            <HypeProvider>
              <DirectMessagesProvider><StreamlinedShell /></DirectMessagesProvider>
            </HypeProvider>
          </MessagesProvider>
        </ClientResetProvider>
      </NotificationCoordinatorProvider>
      </MembershipGate>
      </Suspense>
    </AuthGuard>
      <Toaster position="top-center" containerStyle={{ top: 'var(--shadowchat-toast-top, calc(env(safe-area-inset-top) + 1rem))' }} toastOptions={{ style: { background: 'var(--bg-panel-strong)', color: 'var(--text-primary)', border: '1px solid var(--border-panel)' } }} />
  </SoundEffectsProvider>
}
