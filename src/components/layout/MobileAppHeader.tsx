import React, { useMemo, useState } from 'react'
import { ArrowLeft, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import { ActiveUsersButton } from '../chat/ActiveUsersButton'
import { PinnedMessagesButton } from '../chat/PinnedMessagesButton'
import { WeatherWidget } from '../chat/WeatherWidget'
import { GoldenEggDiscoveryLogo } from '../easter-egg/GoldenEggDiscoveryLogo'
import { Avatar } from '../ui/Avatar'
import { useOptionalClientReset } from '../../hooks/ClientResetContext'
import { useOptionalMessages } from '../../hooks/MessagesContext'
import { uploadChatImageAsset } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { PresenceVisibility } from '../../types'
import type { AppView } from '../../types/navigation'

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'
const SETTINGS_MAIN_EVENT = 'shadowchat:settings-main'

type HeaderAvatar = {
  src?: string | null
  alt: string
  color?: string | null
  userId?: string | null
  presenceVisibility?: PresenceVisibility | null
}

interface MobileAppHeaderProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  title: string
  eyebrow?: string
  logo?: boolean
  srTitle?: string
  avatar?: HeaderAvatar
  onBack?: () => void
  backLabel?: string
  collapseOnKeyboard?: boolean
  titleElement?: 'h1' | 'p'
  className?: string
  maxWidthClassName?: string
}

export function MobileAppHeader({
  currentView,
  onViewChange,
  title,
  eyebrow,
  logo = false,
  srTitle,
  avatar,
  onBack,
  backLabel = 'Back',
  collapseOnKeyboard = false,
  titleElement,
  className,
  maxWidthClassName = 'max-w-6xl',
}: MobileAppHeaderProps) {
  const messagesContext = useOptionalMessages()
  const { status: resetStatus } = useOptionalClientReset()
  const [sharingWeather, setSharingWeather] = useState(false)
  const TitleElement = titleElement ?? (srTitle ? 'p' : 'h1')
  const pinnedMessages = useMemo(
    () => (messagesContext?.messages || []).filter(message => message.pinned),
    [messagesContext?.messages]
  )

  const openSettings = (section?: 'weather') => {
    if (typeof window !== 'undefined' && section !== 'weather') {
      window.sessionStorage.removeItem(SETTINGS_SECTION_STORAGE_KEY)
      window.dispatchEvent(new CustomEvent(SETTINGS_MAIN_EVENT))
    }
    onViewChange('settings')
  }

  const handleShareWeather = async (file: File) => {
    setSharingWeather(true)
    try {
      if (!messagesContext) {
        throw new Error('General Chat is still loading.')
      }
      const asset = await uploadChatImageAsset(file, 'weather')
      const sent = await messagesContext.sendMessage('Weather share', 'image', asset.publicUrl, undefined, asset.thumbnailUrl)
      if (sent) {
        toast.success('Weather shared')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share weather'
      toast.error(message)
    } finally {
      setSharingWeather(false)
    }
  }

  return (
    <header
      className={cn(
        'glass-panel-strong mobile-app-header relative z-30 flex-shrink-0 border-b border-[var(--border-panel)] px-3 py-1.5 md:px-6',
        collapseOnKeyboard && 'mobile-keyboard-chrome',
        className
      )}
    >
      <div className={cn('mx-auto flex min-h-9 w-full items-center justify-between gap-2', maxWidthClassName)}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--theme-accent-readable)]"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          {logo && (
            <GoldenEggDiscoveryLogo />
          )}

          {avatar && (
            <Avatar
              src={avatar.src || undefined}
              alt={avatar.alt}
              size="sm"
              color={avatar.color || undefined}
              userId={avatar.userId || undefined}
              presenceVisibility={avatar.presenceVisibility || undefined}
              showStatus
              loading="eager"
              fetchPriority="high"
            />
          )}

          <div className="min-w-0 flex-1">
            {srTitle && <h1 className="sr-only">{srTitle}</h1>}
            {eyebrow && (
              <p className="truncate text-[9px] uppercase tracking-[0.13em] text-[var(--text-muted)] min-[380px]:text-[10px] sm:tracking-[0.18em]">
                {eyebrow}
              </p>
            )}
            <TitleElement
              className={cn(
                'truncate font-semibold text-[var(--text-primary)]',
                eyebrow
                  ? 'text-[13px] leading-4 min-[380px]:text-sm'
                  : 'text-sm leading-5 min-[380px]:text-[15px]'
              )}
            >
              {title}
            </TitleElement>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <WeatherWidget
            onOpenSettings={() => openSettings('weather')}
            onShareWeather={sharingWeather ? undefined : handleShareWeather}
          />
          <ActiveUsersButton resetStatus={resetStatus} />
          <PinnedMessagesButton
            messages={pinnedMessages}
            onUnpin={messagesContext?.togglePin ?? (async () => {})}
            onToggleReaction={messagesContext?.toggleReaction ?? (async () => {})}
          />
          <button
            type="button"
            onClick={() => openSettings()}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[var(--text-secondary)] transition-colors hover:text-[var(--theme-accent-readable)]',
              currentView === 'settings'
                ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)]'
            )}
            aria-label="Open app preferences"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
