import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Shield, Swords, X } from 'lucide-react'
import { useComfortPreferences } from '../../../../hooks/useComfortPreferences'

export interface CheckersNoticeMessage {
  id: number
  tone: 'success' | 'error'
  message: string
}

/** A single table-side notice: repeated actions replace it instead of covering the board. */
export function CheckersNotice({ notice, onDismiss }: {
  notice: CheckersNoticeMessage | null
  onDismiss: () => void
}) {
  const { effectivePreferences, isReducedMotion } = useComfortPreferences()
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(onDismiss, notice.tone === 'error' ? 6000 : 2400)
    return () => window.clearTimeout(timer)
  }, [notice, onDismiss])
  const solid = effectivePreferences.transparency === 'solid'
  const highContrast = effectivePreferences.contrast === 'high'
  return <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+3.25rem)] z-[150] flex justify-center" aria-live="polite" aria-atomic="true">
    <AnimatePresence initial={false} mode="wait">
      {notice && <motion.div key={notice.id}
        initial={{ opacity: 0, y: isReducedMotion ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: isReducedMotion ? 0 : 0.18 }}
        role="status" data-checkers-notice={notice.tone}
        className="pointer-events-auto flex max-w-[min(28rem,100%)] items-center gap-2 rounded-md border py-0.5 pl-3 shadow-[0_8px_28px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(240,211,129,0.12)]"
        style={{
          background: solid ? '#13100c' : 'linear-gradient(145deg,rgba(35,27,17,.96),rgba(9,10,10,.94))',
          borderColor: highContrast ? '#f0d381' : notice.tone === 'error' ? '#a97752' : '#806434',
          color: highContrast ? '#fff5d6' : '#e8d4a9',
          backdropFilter: solid ? undefined : 'blur(12px)',
        }}>
        {notice.tone === 'error' ? <Shield aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d5a478]" /> : <Swords aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d7b66f]" />}
        <span className="py-1 font-serif text-sm leading-snug tracking-wide">{notice.message}</span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss table notice" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-[#c3ad7e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]">
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </motion.div>}
    </AnimatePresence>
  </div>
}
