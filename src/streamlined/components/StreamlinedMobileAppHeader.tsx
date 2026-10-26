import { lazy, Suspense, type ReactNode, type Ref } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { cn } from '../../lib/utils'
import type { PresenceVisibility } from '../../types'
import type { AppView } from '../../types/navigation'
import { BRAND_MARK_URL } from '../brand'

const LazyGlobalSearchButton = lazy(() => import('../../components/search/GlobalSearchButton').then(module => ({
  default: module.GlobalSearchButton,
})))

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
  backButtonRef?: Ref<HTMLButtonElement>
  backLabel?: string
  collapseOnKeyboard?: boolean
  titleElement?: 'h1' | 'p'
  className?: string
  maxWidthClassName?: string
  actions?: ReactNode
  showSettings?: boolean
  showSearch?: boolean
}

/** Shares the full edition's sizing and keyboard contract with a static brand mark. */
export function MobileAppHeader({
  currentView,
  onViewChange,
  title,
  eyebrow,
  logo = false,
  srTitle,
  avatar,
  onBack,
  backButtonRef,
  backLabel = 'Back',
  collapseOnKeyboard = false,
  titleElement,
  className,
  maxWidthClassName = 'max-w-6xl',
  actions,
  showSearch = true,
}: MobileAppHeaderProps) {
  const TitleElement = titleElement ?? (srTitle ? 'p' : 'h1')

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
              ref={backButtonRef}
              type="button"
              onClick={onBack}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {logo && (
            <span className="relative h-10 w-10 shrink-0 md:h-11 md:w-11">
              <img
                src={BRAND_MARK_URL}
                alt="SHADO"
                width={44}
                height={44}
                draggable={false}
                className="h-full w-full object-contain"
              />
            </span>
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
              <p className="truncate text-[0.5625rem] uppercase tracking-[0.13em] text-[var(--text-muted)] min-[380px]:text-[0.625rem] sm:tracking-[0.18em]">
                {eyebrow}
              </p>
            )}
            <TitleElement
              className={cn(
                'truncate font-semibold text-[var(--text-primary)]',
                eyebrow
                  ? 'text-[0.8125rem] leading-4 min-[380px]:text-sm'
                  : 'text-sm leading-5 min-[380px]:text-[0.9375rem]'
              )}
            >
              {title}
            </TitleElement>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {showSearch && (
            <Suspense fallback={<span className="h-11 w-11" aria-hidden="true" />}>
              <LazyGlobalSearchButton
                active={currentView === 'discover'}
                onOpen={() => onViewChange('discover')}
              />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  )
}
