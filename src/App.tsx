import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { MessagesProvider } from './hooks/useMessages'
import { DirectMessagesProvider } from './hooks/useDirectMessages'
import { HypeProvider } from './hooks/useHype'
import { MobileNav } from './components/layout/MobileNav'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useMessageNotifications } from './hooks/useMessageNotifications'
import { ClientResetProvider } from './hooks/ClientResetContext'
import { SoundEffectsProvider } from './hooks/useSoundEffects'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { AppBadgeSync } from './components/notifications/AppBadgeSync'
import { PushSubscriptionSync } from './components/notifications/PushSubscriptionSync'
import { PhoneInstallOnboarding } from './components/onboarding/PhoneInstallOnboarding'
import { AppReleaseGate } from './components/releases/AppReleaseGate'
import { GoldenEggDiscoveryController } from './components/easter-egg/GoldenEggDiscovery'
import { HypeCelebrationController } from './components/hype/HypeCelebrationController'
import { useSessionResumeRecovery } from './hooks/useSessionResumeRecovery'
import { useAdminRoleNotifications } from './hooks/useAdminRoleNotifications'
import { useChannelBanExpirySweep } from './hooks/useChannelBanExpirySweep'
import { useTheme } from './hooks/useTheme'
import { WeatherProvider } from './hooks/useWeatherForecast'
import { computeMobileViewportState, MOBILE_VIEWPORT_UPDATED_EVENT } from './lib/mobileViewport'
import { ACTIVITY_FEATURE_ENABLED, BOARDS_FEATURE_ENABLED } from './config/featureFlags'
import {
  getLocationStateFromUrl,
  resolveChatThreadRouteMutation,
  resolveDMRouteMutation,
  resolvePlayRouteMutation,
  resolvePinRouteMutation,
  resolvePinFeedModeMutation,
  resolvePinCircleFilterMutation,
  resolveInnerCircleRouteMutation,
  shouldPersistDMPanelInUrl,
  type AppLocationState as LocationState,
  type DMHistoryLayer,
  type DMRouteAction,
  type PinHistoryLayer,
  type PinFeedMode,
  type PinRouteAction,
  type InnerCircleHistoryLayer,
  type InnerCircleRouteAction,
  type PlayExperience,
  type PlayHistoryLayer,
  type PlayRouteAction,
  type ChatThreadHistoryLayer,
  type ChatThreadRouteAction,
} from './lib/appRouting'
import type { AppView as View } from './types/navigation'
import { useShadowPinCommentNotifications } from './features/shadow-pin/hooks/useShadowPinCommentNotifications'
import { useConnectionNotifications } from './features/connections/useConnectionNotifications'
import type { ActivityTarget } from './features/activity/activityModel'
import { FirstRunActivationCoordinator } from './features/activation/FirstRunActivationCoordinator'

const DirectMessagesView = lazy(() =>
  import('./components/dms/DirectMessagesView').then(module => ({
    default: module.DirectMessagesView,
  }))
)

const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then(module => ({
    default: module.SettingsView,
  }))
)

const BoardsView = BOARDS_FEATURE_ENABLED
  ? lazy(() =>
      import('./components/boards/BoardsView').then(module => ({
        default: module.BoardsView,
      }))
    )
  : null

const BoardsRuntime = BOARDS_FEATURE_ENABLED
  ? lazy(() =>
      import('./components/boards/BoardsRuntime').then(module => ({
        default: module.BoardsRuntime,
      }))
    )
  : null

const GamesHome = lazy(() =>
  import('./features/games/GamesHome').then(module => ({
    default: module.GamesHome,
  }))
)

const ShadowPin = lazy(() =>
  import('./features/shadow-pin/ShadowPin').then(module => ({
    default: module.ShadowPin,
  }))
)

const ActivityView = ACTIVITY_FEATURE_ENABLED
  ? lazy(() =>
      import('./features/activity/ActivityView').then(module => ({
        default: module.ActivityView,
      }))
    )
  : null

const ActivityProvider = ACTIVITY_FEATURE_ENABLED
  ? lazy(() =>
      import('./features/activity/ActivityProvider').then(module => ({
        default: module.ActivityProvider,
      }))
    )
  : null

const getInitialLocationState = (): LocationState => {
  if (typeof window === 'undefined') {
    return {
      view: 'chat',
      conversation: null,
      message: null,
      thread: null,
      dmPanel: null,
      pin: null,
      comment: null,
      pinPanel: null,
      pinFeed: null,
      playExperience: null,
      playItem: null,
    }
  }

  return getLocationStateFromUrl(new URL(window.location.href))
}

function ViewLoadingState() {
  return (
    <div className="theme-app-surface flex flex-1 items-center justify-center">
      <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-7 text-center text-[var(--text-muted)]">
        <div className="mb-3 flex justify-center">
          <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Loading Shado...</p>
      </div>
    </div>
  )
}

function App() {
  useSessionResumeRecovery()
  useAdminRoleNotifications()
  useShadowPinCommentNotifications()
  useConnectionNotifications()
  useChannelBanExpirySweep()
  const { scheme, setScheme, mode } = useTheme()
  const [currentView, setCurrentView] = useState<View>(() => getInitialLocationState().view)
  const [activationEnrollment, setActivationEnrollment] = useState<'checking' | 'enrolled' | 'unenrolled'>('checking')
  const [boardsResetKey, setBoardsResetKey] = useState(0)
  const [boardsChatFooterActive, setBoardsChatFooterActive] = useState(false)
  const [gameImmersive, setGameImmersive] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const mobileAppHeightRef = useRef<number | null>(null)
  const [dmTarget, setDmTarget] = useState<string | null>(() => getInitialLocationState().conversation)
  const [messageTarget, setMessageTarget] = useState<string | null>(() => getInitialLocationState().message)
  const [threadTarget, setThreadTarget] = useState<string | null>(() => getInitialLocationState().thread ?? null)
  const [dmPanel, setDmPanel] = useState<'details' | 'search' | 'shared' | 'connections' | null>(() => getInitialLocationState().dmPanel)
  const [dmConnectionsSection, setDmConnectionsSection] = useState<'circles' | null>(() => getInitialLocationState().dmConnectionsSection ?? null)
  const [dmCircle, setDmCircle] = useState<string | null>(() => getInitialLocationState().dmCircle ?? null)
  const [pinTarget, setPinTarget] = useState<string | null>(() => getInitialLocationState().pin)
  const [commentTarget, setCommentTarget] = useState<string | null>(() => getInitialLocationState().comment)
  const [pinPanel, setPinPanel] = useState<'viewer' | 'comments' | null>(() => getInitialLocationState().pinPanel)
  const [pinFeed, setPinFeed] = useState<'connections' | null>(() => getInitialLocationState().pinFeed)
  const [pinCircle, setPinCircle] = useState<string | null>(() => getInitialLocationState().pinCircle ?? null)
  const [playExperience, setPlayExperience] = useState<PlayExperience | null>(() => getInitialLocationState().playExperience)
  const [playItem, setPlayItem] = useState<string | null>(() => getInitialLocationState().playItem)
  const isDarkMode = mode === 'dark'

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || isDesktop) return

    const root = document.documentElement
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const isIOS =
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
    let frameId: number | null = null
    let settleTimerIds: number[] = []
    root.dataset.shadowchatMobilePlatform = isIOS ? 'ios' : 'android'

    const isEditableFocused = () => {
      const activeElement = document.activeElement
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      )
    }

    const updateMobileViewport = () => {
      const viewport = window.visualViewport
      const layoutHeight = window.innerHeight
      const viewportHeight = viewport?.height ?? window.innerHeight
      const viewportOffsetTop = viewport?.offsetTop ?? 0
      const viewportState = computeMobileViewportState({
        layoutHeight,
        visualViewportHeight: viewportHeight,
        visualViewportOffsetTop: viewportOffsetTop,
        isIOS,
        editableFocused: isEditableFocused(),
        previousStableAppHeight: mobileAppHeightRef.current,
      })
      mobileAppHeightRef.current = viewportState.stableAppHeight

      root.style.setProperty('--shadowchat-app-height', `${viewportState.appHeight}px`)
      root.style.setProperty('--shadowchat-visual-viewport-height', `${viewportState.visualViewportHeight}px`)
      root.style.setProperty('--shadowchat-keyboard-inset', `${viewportState.keyboardInset}px`)
      root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', `${viewportState.scrollKeyboardInset}px`)
      root.style.setProperty('--shadowchat-toast-top', `calc(${viewportOffsetTop}px + env(safe-area-inset-top) + ${viewportState.toastTopRem}rem)`)
      root.style.setProperty('--shadowchat-toast-top-space', `${viewportState.toastTopSpacePx}px`)
      root.dataset.shadowchatKeyboard = viewportState.keyboardOpen ? 'open' : 'closed'
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
    }

    const scheduleMobileViewportUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      settleTimerIds = []

      frameId = requestAnimationFrame(() => {
        frameId = null
        updateMobileViewport()
        settleTimerIds = [80, 180, 320].map(delay =>
          window.setTimeout(updateMobileViewport, delay)
        )
      })
    }

    scheduleMobileViewportUpdate()
    const handleOrientationChange = () => {
      mobileAppHeightRef.current = null
      scheduleMobileViewportUpdate()
    }

    window.visualViewport?.addEventListener('resize', scheduleMobileViewportUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleMobileViewportUpdate)
    window.addEventListener('resize', scheduleMobileViewportUpdate)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.addEventListener('focusin', scheduleMobileViewportUpdate)
    window.addEventListener('focusout', scheduleMobileViewportUpdate)
    window.addEventListener('pageshow', scheduleMobileViewportUpdate)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleMobileViewportUpdate)
      window.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.removeEventListener('focusin', scheduleMobileViewportUpdate)
      window.removeEventListener('focusout', scheduleMobileViewportUpdate)
      window.removeEventListener('pageshow', scheduleMobileViewportUpdate)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      root.style.removeProperty('--shadowchat-visual-viewport-height')
      root.style.removeProperty('--shadowchat-app-height')
      root.style.removeProperty('--shadowchat-keyboard-inset')
      root.style.removeProperty('--shadowchat-mobile-scroll-keyboard-inset')
      root.style.removeProperty('--shadowchat-toast-top')
      root.style.removeProperty('--shadowchat-toast-top-space')
      delete root.dataset.shadowchatKeyboard
      delete root.dataset.shadowchatMobilePlatform
    }
  }, [isDesktop])


  const toggleDarkMode = () => {
    setScheme(scheme === 'moonstone-light' ? 'original' : 'moonstone-light')
  }

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const applyLocationState = useCallback((locationState: LocationState) => {
    setCurrentView(locationState.view)
    setDmTarget(locationState.conversation)
    setMessageTarget(locationState.message)
    setThreadTarget(locationState.thread ?? null)
    setDmPanel(locationState.dmPanel)
    setDmConnectionsSection(locationState.dmConnectionsSection ?? null)
    setDmCircle(locationState.dmCircle ?? null)
    setPinTarget(locationState.pin)
    setCommentTarget(locationState.comment)
    setPinPanel(locationState.pinPanel)
    setPinFeed(locationState.pinFeed)
    setPinCircle(locationState.pinCircle ?? null)
    setPlayExperience(locationState.playExperience)
    setPlayItem(locationState.playItem)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const applyUrlState = () => {
      applyLocationState(getLocationStateFromUrl(new URL(window.location.href)))
    }

    const applyServiceWorkerNotificationClick = (event: MessageEvent) => {
      if (event.data?.type !== 'SHADOWCHAT_NOTIFICATION_CLICK') {
        return
      }

      const route = event.data.targetHref || event.data.targetUrl || event.data.data?.route || event.data.data?.url
      if (typeof route !== 'string') {
        return
      }

      const nextUrl = new URL(route, window.location.origin)
      if (nextUrl.origin !== window.location.origin) {
        return
      }

      window.history.replaceState({}, '', nextUrl)
      applyLocationState(getLocationStateFromUrl(nextUrl))
    }

    window.addEventListener('popstate', applyUrlState)
    window.addEventListener('pageshow', applyUrlState)
    navigator.serviceWorker?.addEventListener('message', applyServiceWorkerNotificationClick)

    return () => {
      window.removeEventListener('popstate', applyUrlState)
      window.removeEventListener('pageshow', applyUrlState)
      navigator.serviceWorker?.removeEventListener('message', applyServiceWorkerNotificationClick)
    }
  }, [applyLocationState])

  useMessageNotifications((conversationId) => {
    setDmTarget(conversationId)
    setMessageTarget(null)
    setCurrentView('dms')
  })

  const closeSidebar = () => setSidebarOpen(false)

  const handleActivityOpen = (target: ActivityTarget) => {
    setCurrentView(target.view)
    setDmTarget(target.conversation)
    setMessageTarget(target.message)
    setPinTarget(target.pin)
    setCommentTarget(target.comment)
    setPinPanel(target.view === 'pins' && target.pin
      ? target.comment ? 'comments' : 'viewer'
      : null)
  }

  const handlePinRoute = (
    action: PinRouteAction,
    imageId?: string,
    commentId?: string
  ) => {
    if (typeof window === 'undefined') return

    const storedLayer = window.history.state?.shadowchatLayer
    const currentLayer: PinHistoryLayer = storedLayer === 'pin-viewer' || storedLayer === 'pin-comments'
      ? storedLayer
      : null
    const mutation = resolvePinRouteMutation({
      currentUrl: new URL(window.location.href),
      currentLayer,
      action,
      imageId,
      commentId,
    })
    if (!mutation) return
    if (mutation.method === 'back') {
      window.history.back()
      return
    }

    const nextState = {
      ...(window.history.state ?? {}),
      shadowchatLayer: mutation.layer,
    }
    if (mutation.method === 'push') {
      window.history.pushState(nextState, '', mutation.url)
    } else {
      window.history.replaceState(nextState, '', mutation.url)
    }
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }

  const handlePinFeedModeChange = useCallback((mode: PinFeedMode) => {
    if (typeof window === 'undefined') return
    const mutation = resolvePinFeedModeMutation({
      currentUrl: new URL(window.location.href),
      mode,
    })
    window.history.replaceState(window.history.state ?? {}, '', mutation.url)
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }, [applyLocationState])

  const handlePinCircleChange = useCallback((circleId: string | null) => {
    if (typeof window === 'undefined') return
    const mutation = resolvePinCircleFilterMutation({
      currentUrl: new URL(window.location.href),
      circleId,
    })
    window.history.replaceState(window.history.state ?? {}, '', mutation.url)
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }, [applyLocationState])

  const handleInnerCircleRoute = useCallback((action: InnerCircleRouteAction, circleId?: string) => {
    if (typeof window === 'undefined') return
    const storedLayer = window.history.state?.shadowchatLayer
    const currentLayer: InnerCircleHistoryLayer | DMHistoryLayer = storedLayer === 'dm-inner-circle' ||
      storedLayer === 'dm-thread' || storedLayer === 'dm-panel' || storedLayer === 'dm-panel-cold' ||
      storedLayer === 'dm-result' || storedLayer === 'dm-result-cold'
      ? storedLayer
      : null
    const mutation = resolveInnerCircleRouteMutation({
      currentUrl: new URL(window.location.href),
      currentLayer,
      action,
      circleId,
    })
    if (!mutation) return
    if (mutation.method === 'back') {
      window.history.back()
      return
    }
    const nextState = { ...(window.history.state ?? {}), shadowchatLayer: mutation.layer }
    if (mutation.method === 'push') window.history.pushState(nextState, '', mutation.url)
    else window.history.replaceState(nextState, '', mutation.url)
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }, [applyLocationState])

  const handleChatThreadRoute = (
    action: ChatThreadRouteAction,
    threadRootId?: string,
    targetMessageId?: string
  ) => {
    if (typeof window === 'undefined') return

    const storedLayer = window.history.state?.shadowchatLayer
    const currentLayer: ChatThreadHistoryLayer = storedLayer === 'chat-thread' ? storedLayer : null
    const mutation = resolveChatThreadRouteMutation({
      currentUrl: new URL(window.location.href),
      currentLayer,
      action,
      threadRootId,
      targetMessageId,
    })
    if (!mutation) return
    if (mutation.method === 'back') {
      window.history.back()
      return
    }

    const nextState = {
      ...(window.history.state ?? {}),
      shadowchatLayer: mutation.layer,
    }
    if (mutation.method === 'push') window.history.pushState(nextState, '', mutation.url)
    else window.history.replaceState(nextState, '', mutation.url)
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }

  const handleDMRoute = (
    action: DMRouteAction,
    conversationId?: string,
    messageId?: string
  ) => {
    if (typeof window === 'undefined') return

    const storedLayer = window.history.state?.shadowchatLayer
    const currentLayer: DMHistoryLayer = storedLayer === 'dm-thread' ||
      storedLayer === 'dm-panel' ||
      storedLayer === 'dm-panel-cold' ||
      storedLayer === 'dm-result' ||
      storedLayer === 'dm-result-cold'
      ? storedLayer
      : null
    const mutation = resolveDMRouteMutation({
      currentUrl: new URL(window.location.href),
      currentLayer,
      action,
      conversationId,
      messageId,
    })
    if (!mutation) return
    if (mutation.method === 'back' || mutation.method === 'back-two') {
      window.history.go(mutation.method === 'back-two' ? -2 : -1)
      return
    }

    const nextState = {
      ...(window.history.state ?? {}),
      shadowchatLayer: mutation.layer,
    }
    if (mutation.method === 'push') {
      window.history.pushState(nextState, '', mutation.url)
    } else {
      window.history.replaceState(nextState, '', mutation.url)
    }
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }

  const handlePlayRoute = (
    action: PlayRouteAction,
    experience?: PlayExperience,
    item?: string
  ) => {
    if (typeof window === 'undefined') return

    const storedLayer = window.history.state?.shadowchatLayer
    const currentLayer: PlayHistoryLayer = storedLayer === 'play-experience' || storedLayer === 'play-item'
      ? storedLayer
      : null
    const mutation = resolvePlayRouteMutation({
      currentUrl: new URL(window.location.href),
      currentLayer,
      action,
      experience,
      item,
    })
    if (!mutation) return
    if (mutation.method === 'back') {
      window.history.back()
      return
    }

    const nextState = {
      ...(window.history.state ?? {}),
      shadowchatLayer: mutation.layer,
    }
    if (mutation.method === 'push') {
      window.history.pushState(nextState, '', mutation.url)
    } else {
      window.history.replaceState(nextState, '', mutation.url)
    }
    applyLocationState(getLocationStateFromUrl(mutation.url))
  }

  const handleViewChange = (view: View) => {
    const availableView = (view === 'boards' && !BOARDS_FEATURE_ENABLED)
      || (view === 'activity' && !ACTIVITY_FEATURE_ENABLED)
      ? 'chat'
      : view

    if (availableView === 'boards') {
      setBoardsResetKey(value => value + 1)
    }
    if (availableView !== 'games') {
      setGameImmersive(false)
      setPlayExperience(null)
      setPlayItem(null)
    }
    setCurrentView(availableView)
    if (availableView !== 'dms') {
      setDmTarget(null)
      setDmPanel(null)
      setDmConnectionsSection(null)
      setDmCircle(null)
    }
    if (availableView !== 'pins') {
      setPinTarget(null)
      setCommentTarget(null)
      setPinPanel(null)
      setPinCircle(null)
    }
    if (availableView !== currentView) {
      setMessageTarget(null)
      setThreadTarget(null)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)

    if (currentView === 'chat') {
      if (threadTarget) {
        url.searchParams.set('view', 'chat')
        url.searchParams.set('thread', threadTarget)
        url.searchParams.set('message', messageTarget || threadTarget)
      } else if (messageTarget) {
        url.searchParams.set('view', 'chat')
        url.searchParams.set('message', messageTarget)
        url.searchParams.delete('thread')
      } else {
        url.searchParams.delete('view')
        url.searchParams.delete('message')
        url.searchParams.delete('thread')
      }
      url.searchParams.delete('conversation')
      url.searchParams.delete('pin')
      url.searchParams.delete('comment')
      url.searchParams.delete('panel')
      url.searchParams.delete('experience')
      url.searchParams.delete('item')
      url.searchParams.delete('feed')
      url.searchParams.delete('section')
      url.searchParams.delete('circle')
    } else {
      url.searchParams.set('view', currentView)
      url.searchParams.delete('thread')
      if (currentView === 'dms' && dmTarget) {
        url.searchParams.set('conversation', dmTarget)
      } else {
        url.searchParams.delete('conversation')
      }
      if (messageTarget) {
        url.searchParams.set('message', messageTarget)
      } else {
        url.searchParams.delete('message')
      }
      if (dmPanel && shouldPersistDMPanelInUrl({ view: currentView, conversation: dmTarget, panel: dmPanel })) {
        url.searchParams.set('panel', dmPanel)
      } else if (currentView !== 'pins') {
        url.searchParams.delete('panel')
      }
      if (currentView === 'dms' && dmPanel === 'connections' && dmConnectionsSection === 'circles') {
        url.searchParams.set('section', 'circles')
        if (dmCircle) url.searchParams.set('circle', dmCircle)
        else url.searchParams.delete('circle')
      } else {
        url.searchParams.delete('section')
        if (currentView !== 'pins') url.searchParams.delete('circle')
      }
      if (currentView === 'pins' && pinTarget) {
        url.searchParams.set('pin', pinTarget)
      } else {
        url.searchParams.delete('pin')
      }
      if (currentView === 'pins' && commentTarget) {
        url.searchParams.set('comment', commentTarget)
      } else {
        url.searchParams.delete('comment')
      }
      if (currentView === 'pins' && pinPanel === 'comments' && pinTarget) {
        url.searchParams.set('panel', 'comments')
      } else if (currentView !== 'dms') {
        url.searchParams.delete('panel')
      }
      if (currentView === 'pins' && pinFeed === 'connections') {
        url.searchParams.set('feed', 'connections')
        if (pinCircle) url.searchParams.set('circle', pinCircle)
        else url.searchParams.delete('circle')
      } else {
        url.searchParams.delete('feed')
        if (currentView === 'pins') url.searchParams.delete('circle')
      }
      if (currentView === 'games' && playExperience) {
        url.searchParams.set('experience', playExperience)
        if (playItem) url.searchParams.set('item', playItem)
        else url.searchParams.delete('item')
      } else {
        url.searchParams.delete('experience')
        url.searchParams.delete('item')
      }
    }

    window.history.replaceState(window.history.state ?? {}, '', url)
  }, [currentView, dmTarget, dmPanel, dmConnectionsSection, dmCircle, messageTarget, threadTarget, pinTarget, commentTarget, pinPanel, pinFeed, pinCircle, playExperience, playItem])

  useEffect(() => {
    if (currentView !== 'boards') {
      setBoardsChatFooterActive(false)
    }
  }, [currentView])

  useEffect(() => {
    if (currentView !== 'games') {
      setGameImmersive(false)
    }
  }, [currentView])

  const hideAppChrome = currentView === 'games' && gameImmersive

  const renderCurrentView = () => {
    switch (currentView) {
      case 'chat':
        return (
          <ChatView
            currentView={currentView}
            onViewChange={handleViewChange}
            initialMessageId={messageTarget || undefined}
            initialThreadId={threadTarget || undefined}
            onThreadRoute={handleChatThreadRoute}
          />
        )
      case 'dms':
        return (
          <DirectMessagesView
            onToggleSidebar={toggleSidebar}
            currentView={currentView}
            onViewChange={handleViewChange}
            initialConversation={dmTarget || undefined}
            initialMessageId={messageTarget || undefined}
            initialPanel={dmPanel}
            initialConnectionsSection={dmConnectionsSection}
            initialCircleId={dmCircle || undefined}
            onRoute={handleDMRoute}
            onConnectionsRoute={handleInnerCircleRoute}
          />
        )
      case 'boards':
        return BOARDS_FEATURE_ENABLED && BoardsView ? (
          <BoardsView
            resetKey={boardsResetKey}
            currentView={currentView}
            onViewChange={handleViewChange}
            onMobileChatActiveChange={setBoardsChatFooterActive}
          />
        ) : (
          <ChatView
            currentView="chat"
            onViewChange={handleViewChange}
            initialMessageId={messageTarget || undefined}
            initialThreadId={threadTarget || undefined}
            onThreadRoute={handleChatThreadRoute}
          />
        )
      case 'activity':
        return ACTIVITY_FEATURE_ENABLED && ActivityView ? (
          <ActivityView
            currentView={currentView}
            onViewChange={handleViewChange}
            onOpenActivity={handleActivityOpen}
          />
        ) : (
          <ChatView currentView="chat" onViewChange={handleViewChange} />
        )
      case 'games':
        return (
          <GamesHome
            currentView={currentView}
            onViewChange={handleViewChange}
            onImmersiveChange={setGameImmersive}
            initialExperience={playExperience || undefined}
            initialItem={playItem || undefined}
            onPlayRoute={handlePlayRoute}
          />
        )
      case 'pins':
        return (
          <ShadowPin
            currentView={currentView}
            onViewChange={handleViewChange}
            initialImageId={pinTarget || undefined}
            initialCommentId={commentTarget || undefined}
            initialPanel={pinPanel || undefined}
            initialFeedMode={pinFeed || undefined}
            initialCircleId={pinCircle || undefined}
            onPinRoute={handlePinRoute}
            onFeedModeChange={handlePinFeedModeChange}
            onCircleChange={handlePinCircleChange}
          />
        )
      case 'settings':
        return (
          <SettingsView
            currentView={currentView}
            onViewChange={handleViewChange}
            onToggleSidebar={toggleSidebar}
          />
        )
      default:
        return (
          <ChatView
            currentView={currentView}
            onViewChange={handleViewChange}
            initialMessageId={messageTarget || undefined}
            initialThreadId={threadTarget || undefined}
            onThreadRoute={handleChatThreadRoute}
          />
        )
    }
  }

  const renderAppShell = (boardsBadgeCount: number) => (
    <WeatherProvider>
      <AppBadgeSync />
      <PushSubscriptionSync />
      <FirstRunActivationCoordinator
        currentView={currentView}
        onNavigate={handleViewChange}
        onEnrollmentStateChange={setActivationEnrollment}
      />
      {activationEnrollment === 'unenrolled' && <PhoneInstallOnboarding />}
      <AppReleaseGate />
      <GoldenEggDiscoveryController />
      <HypeCelebrationController />
      <div className={`app-viewport flex flex-col overflow-hidden md:flex-row ${hideAppChrome ? 'bg-black' : ''}`}>
      {isDesktop && !hideAppChrome && (
        <Sidebar
          currentView={currentView}
          onViewChange={handleViewChange}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          boardsEnabled={BOARDS_FEATURE_ENABLED}
          boardsBadgeCount={boardsBadgeCount}
        />
      )}

      {isDesktop && !hideAppChrome && sidebarOpen && (
        <div
          className="fixed inset-0 bg-[var(--bg-overlay)] md:hidden"
          onClick={closeSidebar}
        />
      )}

      <main className="flex-1 flex min-h-0 flex-col min-w-0 overflow-hidden">
        <Suspense fallback={<ViewLoadingState />}>
          {renderCurrentView()}
        </Suspense>
      </main>

      {/* Mobile bottom navigation */}
      {!hideAppChrome && currentView !== 'chat' && currentView !== 'dms' && !(currentView === 'boards' && boardsChatFooterActive) && (
        <MobileNav
          currentView={currentView}
          onViewChange={handleViewChange}
          boardsEnabled={BOARDS_FEATURE_ENABLED}
          boardsBadgeCount={boardsBadgeCount}
        />
      )}
      </div>
    </WeatherProvider>
  )

  const renderFeatureShell = () => {
    const shell = BOARDS_FEATURE_ENABLED && BoardsRuntime ? (
      <Suspense fallback={<ViewLoadingState />}>
        <BoardsRuntime>{renderAppShell}</BoardsRuntime>
      </Suspense>
    ) : renderAppShell(0)

    return ACTIVITY_FEATURE_ENABLED && ActivityProvider ? (
      <Suspense fallback={<ViewLoadingState />}>
        <ActivityProvider>{shell}</ActivityProvider>
      </Suspense>
    ) : shell
  }

  return (
    <>
      <AuthGuard>
        <ClientResetProvider>
          <SoundEffectsProvider>
            <MessagesProvider>
              <HypeProvider>
                <DirectMessagesProvider>
                  {renderFeatureShell()}
                </DirectMessagesProvider>
              </HypeProvider>
            </MessagesProvider>
          </SoundEffectsProvider>
        </ClientResetProvider>
      </AuthGuard>
    <Toaster
      position={isDesktop ? 'top-right' : 'top-center'}
      containerStyle={
        isDesktop
          ? undefined
          : {
              top: 'var(--shadowchat-toast-top, calc(env(safe-area-inset-top) + 4.5rem))',
              left: '1rem',
              right: '1rem',
              maxHeight: 'calc(var(--shadowchat-visual-viewport-height, 100vh) - var(--shadowchat-toast-top-space, 5rem) - 1rem)',
            }
      }
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--bg-panel-strong)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-panel)',
          boxShadow: 'var(--shadow-panel-strong)',
          backdropFilter: 'blur(18px)',
          borderRadius: '18px',
        },
        success: {
          iconTheme: {
            primary: 'var(--state-success)',
            secondary: 'var(--bg-shell)',
          },
          style: {
            border: '1px solid var(--theme-accent-border-soft)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--state-danger)',
            secondary: 'var(--bg-shell)',
          },
          style: {
            border: '1px solid rgba(180,90,99,0.18)',
          },
        },
        loading: {
          iconTheme: {
            primary: 'var(--theme-accent)',
            secondary: 'var(--bg-shell)',
          },
        },
        blank: {
          iconTheme: {
            primary: 'var(--theme-accent)',
            secondary: 'var(--bg-shell)',
          },
        },
      }}
    />
    </>
  )
}

export default App
