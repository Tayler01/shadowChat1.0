import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { UniversalDiscoveryDialog } from '../../features/discovery/UniversalDiscoveryDialog'

export function GlobalSearchButton({ variant = 'compact' }: { variant?: 'compact' | 'nav' }) {
  const [open, setOpen] = useState(false)

  const clearDiscoveryHistoryState = useCallback(() => {
    if (typeof window === 'undefined' || !window.history.state?.shadowchatDiscovery) return
    const nextState = { ...window.history.state }
    delete nextState.shadowchatDiscovery
    window.history.replaceState(nextState, '', window.location.href)
  }, [])

  const openDiscovery = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({ ...(window.history.state ?? {}), shadowchatDiscovery: true }, '', window.location.href)
    }
    setOpen(true)
  }

  const closeDiscovery = useCallback(() => {
    clearDiscoveryHistoryState()
    setOpen(false)
  }, [clearDiscoveryHistoryState])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setOpen(Boolean(event.state?.shadowchatDiscovery))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={openDiscovery}
        className={variant === 'nav'
          ? 'flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] text-[var(--text-muted)] transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-accent)]'
          : 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]'}
        aria-label="Open search and saved messages"
      >
        {variant === 'nav' ? (
          <>
            <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]"><Search className="h-[1.15rem] w-[1.15rem]" /></span>
            <span>Discover</span>
          </>
        ) : <Search className="h-4 w-4" />}
      </button>
      {typeof document === 'undefined'
        ? <UniversalDiscoveryDialog open={open} onClose={closeDiscovery} onNavigate={() => setOpen(false)} />
        : createPortal(<UniversalDiscoveryDialog open={open} onClose={closeDiscovery} onNavigate={() => setOpen(false)} />, document.body)}
    </>
  )
}
