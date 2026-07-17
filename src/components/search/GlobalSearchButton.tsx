import { Search } from 'lucide-react'

export function GlobalSearchButton({
  variant = 'compact',
  active = false,
  onOpen,
}: {
  variant?: 'compact' | 'nav'
  active?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={variant === 'nav'
        ? `flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-accent)] ${active ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]' : 'text-[var(--text-muted)]'}`
        : `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)] ${active ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]'}`}
      aria-label="Open search and saved messages"
      aria-current={active ? 'page' : undefined}
    >
      {variant === 'nav' ? (
        <>
          <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]"><Search className="h-[1.15rem] w-[1.15rem]" /></span>
          <span>Discover</span>
        </>
      ) : <Search className="h-4 w-4" />}
    </button>
  )
}
